"""Machine create/read services with durable owner-scoped idempotency."""

from __future__ import annotations

import hashlib
import json
from uuid import UUID

from fastapi import HTTPException
from keylorforge_database.models import (
    CatalogEquipment,
    MachineConfiguration,
    MachineMutationReceipt,
    MachineProfile,
    WorkoutMutationReceipt,
)
from sqlalchemy.orm import Session

from app.auth.jwt_verifier import AuthenticatedPrincipal
from app.machines.schemas import (
    CreateMachineConfigurationRequest,
    CreateMachineProfileRequest,
    MachineConfigurationResponse,
    MachineProfileResponse,
)
from app.workouts.service import _active_owner

MachineCommand = CreateMachineProfileRequest | CreateMachineConfigurationRequest


def _intent_hash(request: MachineCommand) -> str:
    canonical = json.dumps(
        request.model_dump(mode="json"),
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
    )
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _profile_response(row: MachineProfile) -> MachineProfileResponse:
    return MachineProfileResponse(
        id=row.id,
        nickname=row.nickname,
        catalog_equipment_id=row.catalog_equipment_id,
        manufacturer=row.manufacturer,
        model_name=row.model_name,
        native_load_unit=row.native_load_unit,
        load_entry_semantics=row.load_entry_semantics,
        technical_metadata=row.technical_metadata,
        metadata_source=row.metadata_source,
        created_at=row.created_at,
    )


def _config_response(row: MachineConfiguration) -> MachineConfigurationResponse:
    return MachineConfigurationResponse(
        id=row.id,
        profile_id=row.machine_profile_id,
        label=row.label,
        material_setup=row.material_setup,
        metadata_source=row.metadata_source,
        created_at=row.created_at,
    )


def _replay_receipt(
    session: Session, *, owner_id: UUID, request: MachineCommand, entity_id: UUID
) -> dict[str, object] | None:
    if session.get(WorkoutMutationReceipt, (request.mutation_id, owner_id)):
        raise HTTPException(409, detail="mutation ID already used for workout")
    receipt = session.get(MachineMutationReceipt, (request.mutation_id, owner_id))
    if receipt is None:
        return None
    if (
        receipt.entity_id != entity_id
        or receipt.mutation_kind != request.kind
        or receipt.intent_hash != _intent_hash(request)
    ):
        raise HTTPException(409, detail="mutation ID reused for different intent")
    return receipt.response_payload


def _write_receipt(
    session: Session,
    *,
    owner_id: UUID,
    request: MachineCommand,
    entity_id: UUID,
    payload: dict[str, object],
) -> None:
    session.add(
        MachineMutationReceipt(
            mutation_id=request.mutation_id,
            owner_user_id=owner_id,
            entity_id=entity_id,
            mutation_kind=request.kind,
            intent_hash=_intent_hash(request),
            response_payload=payload,
        )
    )
    session.flush()


def create_machine_profile(
    *,
    session: Session,
    principal: AuthenticatedPrincipal,
    request: CreateMachineProfileRequest,
) -> MachineProfileResponse:
    owner = _active_owner(session, principal, lock=True)
    replay = _replay_receipt(
        session, owner_id=owner.id, request=request, entity_id=request.profile_id
    )
    if replay is not None:
        return MachineProfileResponse.model_validate(replay)

    if session.get(MachineProfile, request.profile_id) is not None:
        raise HTTPException(409, detail="machine profile ID already in use")
    if (
        request.catalog_equipment_id is not None
        and session.get(CatalogEquipment, request.catalog_equipment_id) is None
    ):
        raise HTTPException(422, detail="catalogue equipment not found")
    row = MachineProfile(
        id=request.profile_id,
        owner_user_id=owner.id,
        nickname=request.nickname,
        catalog_equipment_id=request.catalog_equipment_id,
        manufacturer=request.manufacturer,
        model_name=request.model_name,
        native_load_unit=request.native_load_unit,
        load_entry_semantics=request.load_entry_semantics,
        technical_metadata=request.technical_metadata,
        metadata_source=request.metadata_source,
    )
    session.add(row)
    session.flush()
    response = _profile_response(row)
    _write_receipt(
        session,
        owner_id=owner.id,
        request=request,
        entity_id=row.id,
        payload=response.model_dump(mode="json"),
    )
    return response


def create_machine_configuration(
    *,
    session: Session,
    principal: AuthenticatedPrincipal,
    request: CreateMachineConfigurationRequest,
) -> MachineConfigurationResponse:
    owner = _active_owner(session, principal, lock=True)
    replay = _replay_receipt(
        session, owner_id=owner.id, request=request, entity_id=request.configuration_id
    )
    if replay is not None:
        return MachineConfigurationResponse.model_validate(replay)

    profile = session.get(MachineProfile, request.profile_id)
    if profile is None or profile.owner_user_id != owner.id:
        raise HTTPException(404, detail="machine profile not found")
    if session.get(MachineConfiguration, request.configuration_id) is not None:
        raise HTTPException(409, detail="configuration ID already in use")
    row = MachineConfiguration(
        id=request.configuration_id,
        owner_user_id=owner.id,
        machine_profile_id=profile.id,
        label=request.label,
        material_setup=request.material_setup,
        metadata_source=request.metadata_source,
    )
    session.add(row)
    session.flush()
    response = _config_response(row)
    _write_receipt(
        session,
        owner_id=owner.id,
        request=request,
        entity_id=row.id,
        payload=response.model_dump(mode="json"),
    )
    return response


def read_machine_profile(
    *, session: Session, principal: AuthenticatedPrincipal, profile_id: UUID
) -> MachineProfileResponse:
    owner = _active_owner(session, principal, lock=True)
    profile = session.get(MachineProfile, profile_id)
    if profile is None or profile.owner_user_id != owner.id:
        raise HTTPException(404, detail="machine profile not found")
    return _profile_response(profile)


def read_machine_configuration(
    *,
    session: Session,
    principal: AuthenticatedPrincipal,
    profile_id: UUID,
    configuration_id: UUID,
) -> MachineConfigurationResponse:
    owner = _active_owner(session, principal, lock=True)
    row = session.get(MachineConfiguration, configuration_id)
    if (
        row is None
        or row.owner_user_id != owner.id
        or row.machine_profile_id != profile_id
    ):
        raise HTTPException(404, detail="machine configuration not found")
    return _config_response(row)

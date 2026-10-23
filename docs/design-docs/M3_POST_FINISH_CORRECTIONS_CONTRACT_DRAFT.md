# KeylorForge M3 — Post-finish correction contract (DRAFT)

**Status:** Contract proposal for #167, not implemented. No existing confirmed sets,
completed workout snapshots or mutation receipts may be overwritten.

## Invariants

1. A correction is a new, immutable, account-owned event. Immutable source
   rows remain historical facts; only a separate *effective view* changes.
2. FINISH cannot be called again, sessions cannot be silently reopened, and
   confirmed-set counts remain independently auditable.
3. Server validates the owner of every referenced session, occurrence and set,
   under the existing owner transaction lock. No ID enumeration across accounts.
4. Every correction has a UUID and expected previous revision. Replays of the
   same payload are idempotent; conflicting reuse of UUID or a stale revision
   returns 409 without losing the candidate change.
5. Changes to canonical exercise identity require measurement compatibility;
   load unit, machine semantics, equipment and user-entered weight must never
   be silently reinterpreted.
6. Offline edits are durable pending events until a matching committed remote
   receipt has been verified and acknowledged locally. Auth changes fail closed.

## Event draft

- protocol_version: 1
- kind: CORRECT_FINISHED_SET | RELABEL_FINISHED_EXERCISE
- revision_id: UUID
- session_id: UUID
- occurrence_id: UUID
- set_id: UUID (for CORRECT_FINISHED_SET only)
- expected_previous_revision_id: UUID or null (optimistic concurrency)
- canonical_exercise_id_before/after (for RELABEL_FINISHED_EXERCISE)
- measurement_after: explicit reps / duration / distance as appropriate
- load_after: explicit native decimal, unit and semantics, or null
- corrected_at_utc: aware timestamp
- reason: optional, max 500 characters

The projection must show effective and original versions distinctly, label
corrected rows, keep all notes (#168) separate from corrected measurements,
and preserve original FINISH snapshot provenance.

## UX

Historial → Sesión → Ejercicio → Serie → Editar → Guardar corrección.
Only show Editar when local storage, remote mutation, reconciliation, error
handling and audit view are complete. Handle conflicts explicitly; never drop
drafts or silently overwrite another device's correction.

## Acceptance

- Two sequential corrections preserve the original plus both revisions.
- Two devices editing the same base: one accepted; the other retains a visible
  conflict and editable draft.
- One server receipt per event ID; no duplicate FINISH or set confirmation.
- Fully owner-scoped, survives restart / airplane mode / reconnect.
- Corrected effective statistics and longitudinal exercise views are coherent,
  while immutable performed-set and completion records remain untouched.
- No uninstalls, SQLite clears, destructive migrations or re-running already
  passed M3 physical QA.

**Gate:** finish notes pipeline #168 (including cross-device/cache QA) before
implementing this correction event type, its API, outbox, projection and UI.

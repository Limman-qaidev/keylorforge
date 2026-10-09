"""SQLite migration smoke test using only Python standard library."""
import sqlite3
from pathlib import Path

root = Path(__file__).resolve().parent.parent / "lib" / "workouts"

def sql(file, prefix):
    data = (root / file).read_text(encoding="utf-8")
    return data.split(prefix + " = `", 1)[1].split("`;", 1)[0]

def test_upgrade():
    db = sqlite3.connect(":memory:")
    db.executescript(sql("local-schema.ts", "LOCAL_WORKOUT_SCHEMA_SQL"))
    db.execute("PRAGMA foreign_keys = ON")
    subject = "a3dbf764-e0e3-41aa-9895-6e58eadfbb14"
    session = "1f2d27bc-4904-4f4f-9367-39565d78f211"
    db.execute("INSERT INTO local_workout_sessions (subject,session_id,origin,started_at_utc,time_zone,utc_offset_minutes,local_date,original_agenda_json) VALUES (?,?,'free','2026-10-08T14:30:00Z','Europe/Madrid',120,'2026-10-08','{}')", (subject,session))
    db.execute("INSERT INTO local_workout_outbox (subject,mutation_id,session_id,mutation_kind,protocol_version,payload_json,created_at_utc) VALUES (?, 'm1', ?, 'START_SESSION', 1,'{}','2026-10-08T14:30:00Z')", (subject,session))
    db.execute(
        "INSERT INTO local_workout_outbox "
        "(subject,mutation_id,session_id,mutation_kind,protocol_version,payload_json,"
        "created_at_utc,depends_on_mutation_id) "
        "VALUES (?,'m2',?,'START_SESSION',1,'{}','2026-10-08T14:31:00Z','m1')",
        (subject, session),
    )
    db.commit()
    db.execute("PRAGMA foreign_keys = OFF")
    db.executescript(sql("local-performed-schema.ts", "LOCAL_WORKOUT_V2_MIGRATION_SQL"))
    assert db.in_transaction
    assert not db.execute("PRAGMA foreign_key_check").fetchall()
    db.execute("PRAGMA user_version = 2")
    db.commit()
    db.execute("PRAGMA foreign_keys = ON")
    assert db.execute("PRAGMA user_version").fetchone()[0] == 2
    assert db.execute(
        "SELECT depends_on_mutation_id FROM local_workout_outbox "
        "WHERE subject=? AND mutation_id='m2'", (subject,)
    ).fetchone() == ("m1",)
    occurrence = "c226a777-d460-4d5f-bad6-f75667a9d022"
    performed_set = "1b428bd6-781d-44ec-8609-57af594a5511"
    mutation = "0d72c629-6248-4221-8ab2-d9b9f1b63901"
    db.execute(
        "INSERT INTO local_workout_occurrences "
        "(subject,session_id,occurrence_id,canonical_exercise_id,actual_order,first_set_id) "
        "VALUES (?,?,?,'502c4c87-80a5-4567-9aaf-296e43bfc4d1',0,?)",
        (subject, session, occurrence, performed_set),
    )
    db.execute(
        "INSERT INTO local_workout_outbox "
        "(subject,mutation_id,session_id,mutation_kind,protocol_version,payload_json,"
        "created_at_utc,depends_on_mutation_id) "
        "VALUES (?,?,?,'CONFIRM_FIRST_SET_WITH_OCCURRENCE',1,'{}',?,'m2')",
        (subject, mutation, session, "2026-10-08T14:40:00Z"),
    )
    db.execute(
        "INSERT INTO local_workout_sets "
        "(subject,session_id,set_id,occurrence_id,set_role,measurement_type,reps,"
        "load_decimal,load_unit,load_entry_semantics,completed_at_utc,mutation_id) "
        "VALUES (?,?,?,?,'WARMUP','reps',12,'20.5','kg','machine_display',?,?)",
        (subject, session, performed_set, occurrence, "2026-10-08T14:40:00Z", mutation),
    )
    db.commit()
    assert db.execute("SELECT COUNT(*) FROM local_workout_sets").fetchone()[0] == 1
    assert not db.execute("PRAGMA foreign_key_check").fetchall()
    print("PASS: SQLite migration retained dependent mutations and stored atomic first-set rows")

    # A second subject sharing the same schema must not be affected by QA reset.
    other = "e426dd13-344a-4b69-8920-cb014715c6c1"
    other_session = "d811e91f-2fc2-4af6-a8d7-90bc9a816922"
    db.execute(
        "INSERT INTO local_workout_sessions "
        "(subject,session_id,origin,started_at_utc,time_zone,"
        "utc_offset_minutes,local_date,original_agenda_json) "
        "VALUES (?,?,'free','2026-10-08T14:30:00Z',"
        "'Europe/Madrid',120,'2026-10-08','{}')",
        (other, other_session),
    )
    db.execute(
        "INSERT INTO local_workout_outbox "
        "(subject,mutation_id,session_id,mutation_kind,protocol_version,"
        "payload_json,created_at_utc) "
        "VALUES (?,'other-start',?,'START_SESSION',1,'{}',"
        "'2026-10-08T14:30:00Z')",
        (other, other_session),
    )
    db.commit()

    # Regression: the original bulk-delete fails with ON DELETE RESTRICT.
    try:
        db.execute("DELETE FROM local_workout_outbox WHERE subject=?", (subject,))
    except sqlite3.IntegrityError:
        db.rollback()
    else:
        raise AssertionError("Dependent outbox bulk delete unexpectedly succeeded")

    db.execute("DELETE FROM local_workout_sets WHERE subject=?", (subject,))
    db.execute("DELETE FROM local_workout_occurrences WHERE subject=?", (subject,))

    removed = []
    while True:
        leaf = db.execute(
            "SELECT parent.mutation_id "
            "FROM local_workout_outbox AS parent "
            "WHERE parent.subject = ? "
            "AND NOT EXISTS ( "
            "  SELECT 1 FROM local_workout_outbox AS child "
            "  WHERE child.subject = parent.subject "
            "    AND child.depends_on_mutation_id = parent.mutation_id "
            ") LIMIT 1",
            (subject,),
        ).fetchone()
        if leaf is None:
            assert db.execute(
                "SELECT COUNT(*) FROM local_workout_outbox WHERE subject=?",
                (subject,),
            ).fetchone()[0] == 0
            break
        db.execute(
            "DELETE FROM local_workout_outbox "
            "WHERE subject=? AND mutation_id=?",
            (subject, leaf[0]),
        )
        removed.append(leaf[0])

    db.execute("DELETE FROM local_workout_sessions WHERE subject=?", (subject,))
    db.commit()
    assert removed == [mutation, "m2", "m1"]
    assert db.execute(
        "SELECT COUNT(*) FROM local_workout_sessions WHERE subject=?", (subject,)
    ).fetchone()[0] == 0
    assert db.execute(
        "SELECT COUNT(*) FROM local_workout_outbox WHERE subject=?", (other,)
    ).fetchone()[0] == 1
    assert db.execute(
        "SELECT COUNT(*) FROM local_workout_sessions WHERE subject=?", (other,)
    ).fetchone()[0] == 1
    assert not db.execute("PRAGMA foreign_key_check").fetchall()
    print("PASS: QA reset deletes FK-dependent outbox leaves first; other subject retained")



def test_machine_v3_upgrade():
    """The real v2→v3 SQLite upgrade must preserve existing performed history."""
    db = sqlite3.connect(":memory:")
    db.executescript(sql("local-schema.ts", "LOCAL_WORKOUT_SCHEMA_SQL"))
    subject = "a3dbf764-e0e3-41aa-9895-6e58eadfbb14"
    other = "e426dd13-344a-4b69-8920-cb014715c6c1"
    session = "1f2d27bc-4904-4f4f-9367-39565d78f211"
    db.execute(
        "INSERT INTO local_workout_sessions "
        "(subject,session_id,origin,started_at_utc,time_zone,utc_offset_minutes,"
        "local_date,original_agenda_json) "
        "VALUES (?,?,'free','2026-10-08T14:30:00Z','Europe/Madrid',120,"
        "'2026-10-08','{}')",
        (subject, session),
    )
    db.execute(
        "INSERT INTO local_workout_outbox "
        "(subject,mutation_id,session_id,mutation_kind,protocol_version,"
        "payload_json,created_at_utc) "
        "VALUES (?,'prior-start',?,'START_SESSION',1,'{}','2026-10-08T14:30:00Z')",
        (subject, session),
    )
    db.commit()
    db.execute("PRAGMA foreign_keys = OFF")
    db.executescript(sql("local-performed-schema.ts", "LOCAL_WORKOUT_V2_MIGRATION_SQL"))
    assert not db.execute("PRAGMA foreign_key_check").fetchall()
    db.execute("PRAGMA user_version = 2")
    db.commit()
    db.execute("PRAGMA foreign_keys = ON")
    db.execute(
        "INSERT INTO local_workout_occurrences "
        "(subject,session_id,occurrence_id,canonical_exercise_id,actual_order,first_set_id) "
        "VALUES (?,?,'old-occ','old-exercise',0,'old-set')", (subject, session)
    )
    db.execute(
        "INSERT INTO local_workout_outbox "
        "(subject,mutation_id,session_id,mutation_kind,protocol_version,payload_json,"
        "created_at_utc,depends_on_mutation_id) "
        "VALUES (?,'prior-first',?,'CONFIRM_FIRST_SET_WITH_OCCURRENCE',1,'{}',"
        "'2026-10-08T14:40:00Z','prior-start')",
        (subject, session),
    )
    db.execute(
        "INSERT INTO local_workout_sets "
        "(subject,session_id,set_id,occurrence_id,set_role,measurement_type,reps,"
        "load_decimal,load_unit,load_entry_semantics,machine_profile_id,"
        "machine_snapshot_json,completed_at_utc,mutation_id) "
        "VALUES (?,?,'old-set','old-occ','WARMUP','reps',12,'20.5','kg',"
        "'machine_display','old-machine','{\"label\":\"Polea A\"}',"
        "'2026-10-08T14:40:00Z','prior-first')",
        (subject, session),
    )
    db.commit()
    old_set = db.execute(
        "SELECT machine_profile_id,machine_snapshot_json,load_decimal,load_unit "
        "FROM local_workout_sets"
    ).fetchone()

    # New schema tables appear additively with no copying of prior sets or outbox.
    db.executescript(sql("local-machine-schema.ts", "LOCAL_WORKOUT_V3_MIGRATION_SQL"))
    assert db.in_transaction
    assert not db.execute("PRAGMA foreign_key_check").fetchall()
    db.execute("PRAGMA user_version = 3")
    db.commit()
    assert db.execute("PRAGMA user_version").fetchone()[0] == 3
    assert db.execute(
        "SELECT machine_profile_id,machine_snapshot_json,load_decimal,load_unit "
        "FROM local_workout_sets"
    ).fetchone() == old_set
    assert db.execute("SELECT COUNT(*) FROM local_workout_outbox").fetchone()[0] == 2

    db.execute(
        "INSERT INTO local_machine_outbox "
        "(subject,mutation_id,mutation_kind,profile_id,entity_id,protocol_version,"
        "payload_json,created_at_utc) VALUES (?,'profile-create',"
        "'CREATE_MACHINE_PROFILE','profile-a','profile-a',1,'{}','2026-10-09T08:00:00Z')",
        (subject,),
    )
    db.execute(
        "INSERT INTO local_machine_profiles "
        "(subject,profile_id,nickname,technical_metadata_json,metadata_source,"
        "created_at_utc,create_mutation_id) "
        "VALUES (?,'profile-a','Polea A','{}','user_entered',"
        "'2026-10-09T08:00:00Z','profile-create')",
        (subject,),
    )
    db.execute(
        "INSERT INTO local_machine_outbox "
        "(subject,mutation_id,mutation_kind,profile_id,entity_id,protocol_version,"
        "payload_json,created_at_utc,depends_on_mutation_id) "
        "VALUES (?,'config-create','CREATE_MACHINE_CONFIGURATION','profile-a',"
        "'config-a',1,'{}','2026-10-09T08:01:00Z','profile-create')",
        (subject,),
    )
    db.execute(
        "INSERT INTO local_machine_configurations "
        "(subject,configuration_id,profile_id,label,material_setup_json,"
        "metadata_source,created_at_utc,create_mutation_id) "
        "VALUES (?,'config-a','profile-a','Cable top','{}',"
        "'user_entered','2026-10-09T08:01:00Z','config-create')",
        (subject,),
    )
    db.commit()
    assert db.execute(
        "SELECT depends_on_mutation_id FROM local_machine_outbox "
        "WHERE subject=? AND mutation_id='config-create'", (subject,)
    ).fetchone() == ("profile-create",)

    # Cross-owner references are rejected even when a guessed ID exists.
    try:
        db.execute(
            "INSERT INTO local_machine_configurations "
            "(subject,configuration_id,profile_id,label,material_setup_json,"
            "metadata_source,created_at_utc,create_mutation_id) "
            "VALUES (?,'foreign-config','profile-a','Wrong owner','{}',"
            "'user_entered','2026-10-09T08:02:00Z','config-create')",
            (other,),
        )
    except sqlite3.IntegrityError:
        db.rollback()
    else:
        raise AssertionError("SQLite permitted cross-owner machine configuration")
    assert not db.execute("PRAGMA foreign_key_check").fetchall()
    print("PASS: SQLite v3 retained v2 workout/set/snapshot and enforced machine causality")

    # A failure *mid-migration* must leave all new tables and version rolled back.
    broken = sqlite3.connect(":memory:")
    broken.executescript(sql("local-schema.ts", "LOCAL_WORKOUT_SCHEMA_SQL"))
    broken.execute("PRAGMA foreign_keys = OFF")
    broken.executescript(sql("local-performed-schema.ts", "LOCAL_WORKOUT_V2_MIGRATION_SQL"))
    broken.execute("PRAGMA user_version = 2")
    broken.commit()
    broken.execute("CREATE TABLE local_machine_profiles (occupied INTEGER)")
    broken.commit()
    try:
        broken.executescript(sql("local-machine-schema.ts", "LOCAL_WORKOUT_V3_MIGRATION_SQL"))
    except sqlite3.OperationalError:
        broken.rollback()
    else:
        raise AssertionError("Migration unexpectedly succeeded over conflicting table")
    assert broken.execute("PRAGMA user_version").fetchone()[0] == 2
    assert not broken.execute(
        "SELECT name FROM sqlite_master WHERE name='local_machine_outbox'"
    ).fetchone()
    print("PASS: v3 partial migration rolled back without advancing schema version")



def test_finish_v4_upgrade():
    """v3→v4 preserves historical sets, machine rows and dependent outbox."""
    db = sqlite3.connect(":memory:")
    db.executescript(sql("local-schema.ts", "LOCAL_WORKOUT_SCHEMA_SQL"))
    subject = "a3dbf764-e0e3-41aa-9895-6e58eadfbb14"
    session = "1f2d27bc-4904-4f4f-9367-39565d78f211"

    db.execute(
        "INSERT INTO local_workout_sessions "
        "(subject,session_id,origin,started_at_utc,time_zone,utc_offset_minutes,"
        "local_date,original_agenda_json) "
        "VALUES (?,?,'free','2026-10-08T14:30:00Z','Europe/Madrid',120,"
        "'2026-10-08','{}')",
        (subject, session),
    )
    db.execute(
        "INSERT INTO local_workout_outbox "
        "(subject,mutation_id,session_id,mutation_kind,protocol_version,"
        "payload_json,created_at_utc) "
        "VALUES (?,'prior-start',?,'START_SESSION',1,'{\"original\":true}',"
        "'2026-10-08T14:30:00Z')",
        (subject, session),
    )
    db.commit()

    db.execute("PRAGMA foreign_keys = OFF")
    db.executescript(sql("local-performed-schema.ts", "LOCAL_WORKOUT_V2_MIGRATION_SQL"))
    assert not db.execute("PRAGMA foreign_key_check").fetchall()
    db.execute("PRAGMA user_version = 2")
    db.commit()
    db.execute("PRAGMA foreign_keys = ON")

    db.execute(
        "INSERT INTO local_workout_occurrences "
        "(subject,session_id,occurrence_id,canonical_exercise_id,actual_order,"
        "first_set_id) VALUES (?,?,'occ-1','exercise-1',0,'set-1')",
        (subject, session),
    )
    db.execute(
        "INSERT INTO local_workout_outbox "
        "(subject,mutation_id,session_id,mutation_kind,protocol_version,"
        "payload_json,delivery_state,created_at_utc,depends_on_mutation_id) "
        "VALUES (?,'set-mutation',?,'CONFIRM_FIRST_SET_WITH_OCCURRENCE',"
        "1,'{\"set\":true}','blocked','2026-10-08T14:40:00Z','prior-start')",
        (subject, session),
    )
    db.execute(
        "INSERT INTO local_workout_sets "
        "(subject,session_id,set_id,occurrence_id,set_role,measurement_type,"
        "reps,load_decimal,load_unit,load_entry_semantics,machine_profile_id,"
        "machine_snapshot_json,completed_at_utc,mutation_id) "
        "VALUES (?,?,'set-1','occ-1','WORKING','reps',8,'27.5','lb',"
        "'machine_display','machine-1','{\"label\":\"Polea A\"}',"
        "'2026-10-08T14:40:00Z','set-mutation')",
        (subject, session),
    )
    db.commit()

    db.executescript(sql("local-machine-schema.ts", "LOCAL_WORKOUT_V3_MIGRATION_SQL"))
    assert not db.execute("PRAGMA foreign_key_check").fetchall()
    db.execute("PRAGMA user_version = 3")
    db.commit()
    db.execute(
        "INSERT INTO local_machine_outbox "
        "(subject,mutation_id,mutation_kind,profile_id,entity_id,"
        "protocol_version,payload_json,created_at_utc) "
        "VALUES (?,'create-machine','CREATE_MACHINE_PROFILE','machine-1',"
        "'machine-1',1,'{}','2026-10-08T15:00:00Z')",
        (subject,),
    )
    db.execute(
        "INSERT INTO local_machine_profiles "
        "(subject,profile_id,nickname,technical_metadata_json,metadata_source,"
        "created_at_utc,create_mutation_id) "
        "VALUES (?,'machine-1','Polea A','{}','user_entered',"
        "'2026-10-08T15:00:00Z','create-machine')",
        (subject,),
    )
    db.commit()

    before_outbox = db.execute(
        "SELECT mutation_id,mutation_kind,payload_json,delivery_state,"
        "depends_on_mutation_id FROM local_workout_outbox ORDER BY mutation_id"
    ).fetchall()
    before_set = db.execute(
        "SELECT set_id,reps,load_decimal,load_unit,machine_snapshot_json "
        "FROM local_workout_sets"
    ).fetchall()
    before_machine = db.execute(
        "SELECT profile_id,nickname FROM local_machine_profiles"
    ).fetchall()

    db.execute("PRAGMA foreign_keys = OFF")
    db.executescript(sql("local-finish-schema.ts", "LOCAL_WORKOUT_V4_MIGRATION_SQL"))
    assert db.in_transaction
    assert not db.execute("PRAGMA foreign_key_check").fetchall()
    db.execute("PRAGMA user_version = 4")
    db.commit()
    db.execute("PRAGMA foreign_keys = ON")

    assert db.execute("PRAGMA user_version").fetchone()[0] == 4
    assert db.execute(
        "SELECT mutation_id,mutation_kind,payload_json,delivery_state,"
        "depends_on_mutation_id FROM local_workout_outbox ORDER BY mutation_id"
    ).fetchall() == before_outbox
    assert db.execute(
        "SELECT set_id,reps,load_decimal,load_unit,machine_snapshot_json "
        "FROM local_workout_sets"
    ).fetchall() == before_set
    assert db.execute(
        "SELECT profile_id,nickname FROM local_machine_profiles"
    ).fetchall() == before_machine

    # New FINISH intent links to the final performed mutation, but the
    # migration itself does not end the previously active workout.
    assert db.execute(
        "SELECT lifecycle_state FROM local_workout_sessions WHERE subject=?",
        (subject,),
    ).fetchone() == ("active",)
    assert not db.execute("SELECT * FROM local_workout_final_snapshots").fetchall()
    db.execute(
        "INSERT INTO local_workout_outbox "
        "(subject,mutation_id,session_id,mutation_kind,protocol_version,"
        "payload_json,created_at_utc,depends_on_mutation_id) "
        "VALUES (?,'finish-mut',?,'FINISH_SESSION',1,'{}',"
        "'2026-10-08T15:10:00Z','set-mutation')",
        (subject, session),
    )
    db.execute(
        "INSERT INTO local_workout_final_snapshots "
        "(subject,session_id,finish_mutation_id,finished_at_utc,final_agenda_json) "
        "VALUES (?,?,'finish-mut','2026-10-08T15:10:00Z','{\"items\":[]}')",
        (subject, session),
    )
    db.commit()
    assert not db.execute("PRAGMA foreign_key_check").fetchall()
    print("PASS: v4 retained v3 workouts/machines/outbox and supports causal FINISH")

    # A failed replacement must roll back the outbox copy and schema change.
    broken = sqlite3.connect(":memory:")
    db.backup(broken)
    broken.execute("DELETE FROM local_workout_final_snapshots")
    broken.execute("DELETE FROM local_workout_outbox WHERE mutation_id='finish-mut'")
    broken.execute("DROP TABLE local_workout_final_snapshots")
    broken.execute("PRAGMA user_version = 3")
    broken.execute("CREATE TABLE local_workout_final_snapshots (occupied INTEGER)")
    broken.commit()
    prefailed_outbox = broken.execute(
        "SELECT mutation_id,mutation_kind,payload_json FROM local_workout_outbox "
        "ORDER BY mutation_id"
    ).fetchall()
    broken.execute("PRAGMA foreign_keys = OFF")
    try:
        broken.executescript(
            sql("local-finish-schema.ts", "LOCAL_WORKOUT_V4_MIGRATION_SQL")
        )
    except sqlite3.OperationalError:
        broken.rollback()
    else:
        raise AssertionError("Conflicting v4 snapshot table was not rejected")
    assert broken.execute("PRAGMA user_version").fetchone()[0] == 3
    assert broken.execute(
        "SELECT mutation_id,mutation_kind,payload_json FROM local_workout_outbox "
        "ORDER BY mutation_id"
    ).fetchall() == prefailed_outbox
    assert broken.execute(
        "SELECT name FROM sqlite_master "
        "WHERE name='local_workout_outbox_v4'"
    ).fetchone() is None
    print("PASS: v4 failed migration rolls back with legacy outbox intact")

if __name__ == "__main__":
    test_upgrade()
    test_machine_v3_upgrade()
    test_finish_v4_upgrade()

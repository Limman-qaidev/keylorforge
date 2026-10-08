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

if __name__ == "__main__":
    test_upgrade()

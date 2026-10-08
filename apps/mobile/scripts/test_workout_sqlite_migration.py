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
    db.commit()
    db.execute("PRAGMA foreign_keys = OFF")
    db.executescript(sql("local-performed-schema.ts", "LOCAL_WORKOUT_V2_MIGRATION_SQL"))
    assert db.in_transaction
    assert not db.execute("PRAGMA foreign_key_check").fetchall()
    db.execute("PRAGMA user_version = 2")
    db.commit()
    db.execute("PRAGMA foreign_keys = ON")
    assert db.execute("PRAGMA user_version").fetchone()[0] == 2
    assert db.execute("SELECT COUNT(*) FROM local_workout_outbox WHERE mutation_id='m1'").fetchone()[0] == 1
    assert not db.execute("PRAGMA foreign_key_check").fetchall()
    print("PASS: SQLite v1-to-v2 migration preserved pending mutations")

if __name__ == "__main__":
    test_upgrade()

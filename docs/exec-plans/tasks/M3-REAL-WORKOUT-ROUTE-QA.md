# M3 — Real Android QA workout route: guarded rollout

Only the independent `com.jonathansalgadonieto.keylorforge.qareal` APK with
`expoConfig.extra.m3RealQaWorkoutEnabled === true` and local TEST API :8001
mounts the genuine `FreeWorkoutExperience` at `/train`. It uses
`keylorforge-m3-workouts.db` **inside this package only**, not the original
KeylorForge app or the diagnostic APK.

The feature already includes catalogue, START, confirmed sets, FINISH with a
WORKING-set prerequisite, CANCEL with explicit confirmation, and local durable
history. Opening Entrenar does not implicitly start a session.

Before every queued network mutation the QA release validates authenticated
`GET /_qa/m3-ready` against the **actual** PostgreSQL TEST database
`keylorforge_m3_e2e`. Failure (offline, token expiry, non-TEST server or
malformed receipt) blocks dispatch but preserves SQLite and its outbox.
Offline workout recording remains available without any server.

Ordinary release builds still show the existing exercise catalogue. The
development-only preview uses a distinct, separate local SQLite file.

CI/physical gates: compile this exact release, validate package signature and
signing certificate identity before any attempt to update an existing
`qareal` installation. CI Gradle signing across runs may not match. NEVER
uninstall/clear the previous QA app to force an update, or touch the main
KeylorForge package. User approval required for each merge and physical test.
Independent security review #143, deletion/retention #123 and auth callback
security #58 still gate real user production distribution.

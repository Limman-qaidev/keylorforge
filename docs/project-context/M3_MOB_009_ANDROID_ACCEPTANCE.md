# M3-MOB-009 — Physical Android production offline exercise browser QA

**Issue:** #152
**PR:** #153 (DRAFT)
**Status:** PENDING Product Owner physical verification. This checklist is not a passed test.

## Pre-flight

- Use the already-installed Expo Go on the Galaxy S22 Ultra. Do NOT uninstall or clear app data.
- Use PR #153 JavaScript/Metro on a new isolated worktree; leave existing user worktrees and diagnostic QA SQLite data untouched.
- The independent public catalogue SQLite database was previously confirmed to retain 897 canonical exercises after force-stop on #151.
- Confirm the user is authenticated. A new account requires initial server bootstrap; public canonical catalogue contains no account-owned rows.
- If downloading/updating again via the PC-hosted API, Android requires ADB reverse port 8000 as well as Metro. Browsing must NOT depend on port 8000.

## Product UI (no workout writes)

1. Open normal Entrenar tab. Confirm existing online M2 exercise catalogue is still reachable and there is an entry named **Consultar ejercicios sin conexión**.
2. Tap the entry; expect **Ejercicios sin conexión** and **CATÁLOGO DISPONIBLE · 897 ejercicios**, from local SQLite, without pressing Download.
3. Enable airplane mode and disable Wi-Fi. Search **Abdominal Otis** (accent/case-insensitive); ensure result appears without API calls.
4. Clear search; choose muscle and equipment filters, verifying result count and rows. No session created.
5. While still in airplane mode, force-stop only Expo Go and reopen PR #153. Verify cache status persists and local search continues to work.
6. While offline, tap **Descargar / actualizar catálogo**; expect a controlled error and retention of cached results. Do not use the destructive QA reset.
7. Check existing workout diagnostic DB active session/outbox/sets retain their previous values. This browser must not START, confirm sets, Finish, or write History.

## Stop conditions

If cached list disappears after failed refresh, a user-owned row leaks across subjects, the app crashes offline, or existing diagnostic workout data changes: STOP, record QA failure, fix PR.

After successful physical QA record screenshots and CI evidence in #153; require explicit new Product Owner approval to merge. Close #152 ONLY after successful merge. Keep #143 open for remaining transport QA/independent review.

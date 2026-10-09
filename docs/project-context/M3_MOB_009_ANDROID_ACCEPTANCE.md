# M3-MOB-009 — Samsung acceptance: seamless Entrenar catalogue

**Issue:** #152. **PR:** #153, DRAFT and NOT approved to merge.
**Product Owner corrected the earlier implementation:** there must NOT be a separate user-facing offline catalogue or download control.

## Safe preflight

- Install no new APK, do not uninstall Expo Go or clear app/SQLite data.
- Use the already set up PR #153 detached worktree, existing authenticated user and public SQLite cache of 897 canonical exercises.
- Open Expo Go via Metro 8081, using ADB USB redirection. The backend on port 8000 is only needed for first bootstrap/stale refresh; browsing already cached records must work with it unavailable.
- Existing workouts diagnostic DB must not change.

## Physical user-flow acceptance

1. On the normal **Entrenar** destination, ensure **Catálogo de ejercicios** appears with the usual search, chips, exercise rows and detail view. The rejected **Consultar ejercicios sin conexión** product entry and **Ejercicios sin conexión** route must be absent.
2. With network on, the cached catalogue is loaded automatically; no download button, cache status badge or user-selected mode is shown.
3. Enable airplane mode, ensure Wi-Fi off, **without navigating elsewhere**, and search for **Abdominal Otis** in the usual search. Clear search; apply muscle/equipment filters. Normal exercise rows and result counts must remain available without server connectivity.
4. Open a cached exercise; the SAME detail view must open immediately. Fields absent from the M2 list snapshot must remain explicitly unspecified, not invented. Return normally.
5. Force-stop only Expo Go and reopen the **ordinary Entrenar** tab still in airplane mode. Verify the same UI/search works from all 897 cached canonical exercises. Never clear SQLite.
6. Restore Wi-Fi and resume app; catalogue remains visible while background update is retried opportunistically. A broken/blocked API must not clear or hide an existing complete cache. In a pristine installation without cache, the existing online catalogue may bootstrap in background when authenticated and online; no promise of offline availability before the first successful seed.
7. Verify previous diagnostic active workout sessions/sets/outbox remain untouched.

## Stop conditions

Any separate offline product page/button, disappearance of exercises when toggling network, empty cache after failed refresh, route-level crash, canonical identity mismatches, loss of persisted cache, or mutation of workout data: **STOP, document failure, fix PR before merge**.

Record screenshots for normal UI online/offline and post-force-stop and CI. Do not close #152 until the corrected PR is explicitly approved and merged. #143 remains open for independent security review and workout transport.

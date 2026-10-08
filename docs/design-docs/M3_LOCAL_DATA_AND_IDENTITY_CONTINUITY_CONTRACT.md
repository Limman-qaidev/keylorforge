# M3 Local Data and Identity Continuity Contract

**Status:** Accepted by Product Owner — contract-level security review passed  
**Milestone:** M3 — Workout Engine  
**Issue:** #111  
**Audit source:** #105  
**Date:** 2026-10-08  
**Product Owner approval:** 2026-10-08  
**Contract-level security review:** 2026-10-08

## 1. Purpose

This contract defines what must exist locally for KeylorForge to remain usable when network/auth services are temporarily unavailable, and how that local state is bound to a specific authenticated account.

The core rule is:

> Offline-first means the user can continue using previously established local account state safely. It does not mean local state bypasses remote authentication or account ownership.

This contract complements:

- M1 identity contract;
- ADR-003;
- M3 Workout Domain;
- M3 Workout Sync;
- M3 Persistence/Data Model remediation.

---

## 2. Offline continuity versus first-time bootstrap

M3 guarantees **offline continuity after a successful authenticated bootstrap**.

M3 does not guarantee:

- first-ever account registration while offline;
- first-ever login while offline;
- initial server account provisioning while offline.

After a user has successfully authenticated and the required local read model has been bootstrapped, core workout behavior must continue without network connectivity.

---

## 3. Account-partitioned local store

Every user-owned local row/cache entry must be attributable to one application subject/account partition.

The partition includes, where applicable:

- active/completed local workouts;
- Active Session Agenda;
- Set Drafts;
- outbox mutations;
- Machine Profiles and Machine Configurations;
- Gym Contexts;
- active plan/template data;
- cached prescription snapshots;
- user-created local template revisions supported by M3;
- optional Training Profile and locally edited preference revisions;
- optional session-specific operational context revisions and materially used input snapshots;
- cached recent workout/history data;
- sync cursors/revisions for that account.

Canonical public/system catalogue data may be shared as read-only cached reference data if it contains no user-owned state.

### Rule

The app may render/mutate a user's account-owned partition only when local identity state currently belongs to that same subject.

---

## 4. Minimum offline exercise catalogue

After bootstrap, the app must have enough canonical exercise data locally to support the core live workout journey offline.

At minimum cache:

- canonical exercise ID;
- localized display name needed for search/display;
- active/inactive status;
- measurement type;
- muscle relationships needed for basic display/filtering;
- equipment taxonomy needed for basic display/filtering;
- M3 load/measurement semantics required to build a valid set editor;
- alias/redirect/canonicalization metadata once #89 is implemented.

### 4.1 Offline search

The user must be able to:

- search cached exercises;
- add a cached exercise to a free/active workout;
- inspect the minimum metadata needed to log it correctly.

### 4.2 Instruction/media availability

Long-form instructions/media are not required to be fully cached for core correctness.

If unavailable offline:

- logging remains functional;
- the UI may show cached text where available;
- missing media/instructions must not block a workout.

### 4.3 First cache seed

Implementation may use:

- initial API bootstrap;
- a bundled generated snapshot;
- or both.

The product contract is the outcome, not one specific transport choice.

If only API bootstrap is used, the app must make clear that full offline catalogue use becomes available after initial synchronization.

---

## 5. Cached plan/template data

The local read model must contain enough active planning data to start a previously synchronized planned workout offline.

At minimum:

- active Training Plan identity/current accepted revision;
- ordered relevant Plan Steps;
- referenced Workout Template revision or equivalent prescription;
- exercise/target prescription required to construct Today's Proposal / initial agenda;
- current configured Training Intent revision, **if any** (absence is valid for Free Workout cold start);
- optional Training Profile/preferences and operational context when needed for offline plan suggestions;
- existing execution groups needed by the plan.

### Rule

The user must not need a server round trip simply to start the next already-known/cached plan workout.

If a plan revision has never been cached on the device, the app may fall back to:

- Free workout;
- other cached workout/template options.

Do not fabricate missing plan data.

---

## 6. Machine/Gym local data

User-owned Machine Profiles, Machine Configurations and Gym Contexts are local-first.

They must be available offline for:

- restoring last-used machine context;
- selecting known machine-native unit/load settings;
- creating new Machine Profiles during a workout;
- using a newly created profile immediately before it has synced.

A newly created offline Machine Profile receives its stable client ID immediately.

Set mutations referencing it depend causally on its create mutation during sync.

---

## 7. Active-workout local authority

The following must survive app restart with no network:

- active session identity/lifecycle;
- completed sets;
- exercise occurrences;
- Active Session Agenda;
- Set Drafts where present;
- current/last machine context;
- rest-timer timing state where supported;
- pending sync/outbox state;
- session prescription/provenance snapshot.

If this local state proves an active session exists, the app resumes it directly.

---

## 8. Recent history and recommendations offline

Core logging does not require historical recommendation data.

The app may cache recent comparable workout history to support:

- previous values;
- same-machine recent performance;
- deterministic local recommendations.

### Missing history rule

If the relevant recent history is not cached:

- do not invent it;
- do not block logging;
- Decision Engine may abstain or use approved non-personalized defaults.

Full M4 history synchronization is not required by this contract.

---

## 9. Authentication state classes

For M3 local behavior, distinguish conceptually:

### 9.1 ONLINE_AUTHENTICATED

A valid current remote auth session/token is available.

Permits:

- local workout operations;
- protected remote API operations;
- synchronization.

### 9.2 LOCAL_OFFLINE_CONTINUITY

The app has:

- a previously established authenticated subject;
- persisted session/refresh context;
- a matching local account partition;
- no definitive evidence of logout, revocation or account deletion;

but a valid remote token cannot currently be obtained because network/auth infrastructure is unavailable.

Permits:

- local workout operations in the matching partition;
- creation of local outbox mutations;
- access to cached account data.

Does **not** permit:

- protected remote API calls;
- remote sync;
- pretending a remote token is valid.

### 9.3 SIGNED_OUT / TERMINAL

Explicit logout, definitive invalid/revoked refresh state, terminal/deleted account or other accepted M1 terminal auth state.

Does not permit protected account access.

---

## 10. Temporary refresh failure is not definitive revocation

M1 requires clearing auth state when refresh definitively fails.

M3 adds this distinction:

- **network unavailable / provider unreachable / timeout** is not definitive credential invalidation;
- **provider explicitly rejects refresh credentials / server confirms terminal identity** is definitive.

When refresh cannot be attempted or fails transiently due connectivity:

- retain the established local subject;
- enter local offline continuity;
- allow local-only workout use.

When refresh definitively fails:

- leave authenticated/local-continuity state;
- hide account-owned partition;
- require sign-in.

---

## 11. Explicit logout

Explicit logout ends local account access for that subject.

On explicit logout:

1. immediately end KeylorForge local authenticated/offline-continuity access for that subject;
2. clear/deactivate local auth-session state used to enter the protected application shell;
3. stop rendering the subject's account-owned local partition;
4. stop sending that subject's outbox;
5. attempt remote/provider logout/revocation where connectivity permits;
6. preserve unsynced account partition data by default so the same subject can recover it after a later successful sign-in.

A network/provider failure during the remote logout attempt must **not** leave `LOCAL_OFFLINE_CONTINUITY` active. Explicit user logout always wins locally.

Another account on the same installation must never see or sync that data.

### Optional future action

“Remove this account's local data from this device” may be offered separately.

It is not the same operation as ordinary logout.

---

## 12. Account switching

When user A logs out and user B signs in:

- A partition is hidden/inactive;
- A outbox is not selected;
- B partition becomes active;
- cached public catalogue data may be reused;
- user-owned plan/workout/machine/history state is strictly partitioned.

Switching back to A may reactivate A's preserved partition only after A authenticates again.

---

## 13. Account deletion with local workout data

Account deletion remains backend-authorized per M1.

M3 adds the local-data requirement.

### 13.1 Before deletion

If unsynced local user-owned data exists, deletion UX must explicitly communicate that confirmed account deletion will also delete that unsynced local data rather than later synchronize it.

The user must confirm.

### 13.2 Deletion pending

Once deletion is explicitly initiated:

- persist a local `DELETION_PENDING` marker outside normal workout mutation flow;
- freeze normal workout sync for that account partition;
- do not create new normal workout mutations;
- hide/disable normal protected workout use for that subject while deletion is unresolved;
- preserve local partition until deletion outcome is resolved;
- deletion operation remains retry-safe/idempotent under M1 semantics.

The deletion-pending marker must survive process death/restart and must not depend on the presence of a still-refreshable Supabase session.

### 13.3 Confirmed deletion

After the backend has confirmed terminal account deletion:

purge the deleted subject's local account-owned partition, including:

- workout/session/set data;
- Set Drafts;
- Active Session Agenda;
- outbox mutations;
- Machine/Gym entities;
- plans/templates owned by that subject;
- cached user history/profile-specific data;
- local sync metadata.

Then clear auth session and return signed out.

### 13.4 Lost response / crash during deletion

The app must not resurrect normal use of a deletion-pending/terminal local partition after restart.

A special deletion-reconciliation path must exist because the provider identity may already have been removed and therefore ordinary authenticated refresh may no longer be possible.

Acceptable implementation strategies include:

- backend deletion operation returns/uses an idempotent opaque deletion operation ID that can be queried without restoring normal account access;
- a durable server-side terminal application-identity response can be recognized from the deletion retry path;
- or another explicitly reviewed terminal-deletion receipt/status mechanism.

If the device is locally `DELETION_PENDING` and subsequent auth refresh is definitively rejected, the client must **not** infer ordinary logout and reactivate/preserve the partition indefinitely. It enters a deletion-reconciliation state and resolves the terminal deletion outcome through the dedicated mechanism.

After confirmed terminal deletion, local purge is mandatory.

If deletion is proven not to have completed, the user must explicitly recover/re-authenticate before normal account use resumes.

---

## 14. Remote deletion/revocation discovered later

An offline device cannot know immediately that the account was deleted/revoked elsewhere.

While offline it may continue local-only use under the last established subject.

Once connectivity returns:

### Definitive credential/session revocation without account deletion

- stop local authenticated access;
- stop sending the partition outbox;
- hide/quarantine the account-owned partition;
- require the same subject to authenticate again before that preserved partition can be rendered or synced.

Credential/session revocation alone does **not** authorize destructive deletion of unsynced workout data.

### Confirmed account deletion

- stop local authenticated access;
- never sync queued mutations into the deleted account;
- purge the deleted subject's account-owned partition according to §13.

Destructive purge is reserved for confirmed account deletion or a separate explicit local-data removal action.

This is an unavoidable offline-consistency boundary, not remote authorization.

---

## 15. Local catalogue staleness

Cached catalogue data may be stale while offline.

Rules:

- stable exercise IDs remain authoritative references;
- an exercise that later becomes inactive must remain valid for historical workout references;
- “inactive” may prevent new online recommendations/browse after reconciliation but must not corrupt old sessions;
- alias/canonical redirects from #89 must reconcile without losing historical IDs.

If a cached exercise is no longer valid for new use under server rules, synchronization returns an explicit domain result rather than silently remapping to another movement.

---

## 16. Plan/template staleness

If the device has cached plan state/version A and the server later has B:

- a session started offline from A retains provenance/snapshot proving which prescription state it used;
- synchronization must not rewrite that historical session to B;
- after reconciliation, future proposals may use B according to user plan semantics.

The concrete revision mechanism is owned by the M3 Persistence/Data Model Contract (#109 / PR #110). If that contract is approved with immutable revision IDs, this local-data contract consumes those IDs; otherwise it consumes the equivalent approved historical-snapshot mechanism.

---

## 17. Narrow offline template creation

M3 supports one explicit offline template-authoring flow:

> Save completed/free workout as template.

This action may create locally:

- stable Workout Template ID;
- initial immutable template revision;
- outbox mutation for later sync.

The new local template may be reused on the same device before sync.

If an unsynced workout/session references that locally created template/revision as provenance:

- the referencing session/start mutation must depend causally on the template/revision create mutation;
- the sync worker must not send the dependent reference first;
- retry/idempotency semantics apply to both mutations.

This dependency may cross workout boundaries; the Sync Contract's per-session sequential rule is not sufficient by itself for this case.

Full arbitrary offline plan-builder synchronization remains outside the M3 core unless separately approved.

---

## 18. Creating/editing plans offline

M3 does not require complete offline plan-authoring parity.

Required offline planning behavior is:

- consume already cached active plans/templates;
- start cached planned sessions;
- save a completed workout as a new template.

Creating/restructuring a full multi-session Training Plan while offline may require network or a later slice.

The UI must not imply an offline action succeeded remotely before acknowledgement.

---

## 19. Same-device versus cross-device continuity

### Guaranteed in M3

Same-device:

- app restart;
- process death;
- network loss;
- token-refresh outage;

must preserve/resume the active workout.

### Not guaranteed in M3

Seamless continuation of the same active session on another device is **not** an M3 requirement.

M3 handles cross-device conflicts safely, but does not promise live handoff of:

- current agenda;
- Set Draft;
- rest timer;
- unsynced latest sets.

If cross-device continuation is introduced later, it needs an explicit synchronization design.

---

## 20. Local read synchronization

When online, local read caches reconcile from server authority.

Conceptual requirements:

- account-specific revision/cursor where useful;
- transactional application of pulled data;
- do not overwrite newer unsynced local intent;
- immutable revisions remain addressable;
- public catalogue cache may update independently of user outbox.

Exact pull endpoints/cursors remain implementation design.

---

## 21. Data minimization

Do not cache user-owned data merely because it might someday be useful.

Initial M3 local cache should serve:

- active workout continuity;
- offline workout start;
- exercise selection/logging;
- machine context;
- approved decision support;
- narrow template reuse.

Sensitive menstrual/cycle-specific data is not added to local/server persistence until the separate privacy/security decision required by the Product Contract is completed.

Training Profile stable preferences and operational Session Context (time/gym/equipment) have their proposed data-ownership/minimization contract in `M3_TRAINING_PROFILE_AND_SESSION_CONTEXT_CONTRACT.md` (#121); absence of either never blocks logging.

Generic **subjective readiness observations** may be persisted only after a narrower G1 purpose/field/retention and privacy decision. No symptom/menstrual payload may bypass #116 through generic Profile/Context JSON.

---

## 22. User-facing offline status

Normal offline operation should be quiet.

Useful states:

- Offline — workout saved on this device
- Sync pending
- Sync conflict
- Sign-in required to sync

Do not show repeated save errors merely because network is absent.

A locally successful set remains visibly complete.

---

## 23. Failure behavior

### Local SQLite write failure

The action has not safely succeeded.

Preserve typed input where practical and offer retry.

### Network failure

Keep local data and outbox.

### Auth service unreachable

Enter local offline continuity when conditions are satisfied.

### Definitive auth rejection

End account access and require sign-in.

### Catalogue refresh fails

Use cached catalogue.

### Plan refresh fails

Use cached accepted revision when present.

### Optional decision service fails

Use deterministic local behavior/abstain.

---

## 24. Tests implied by this contract

At minimum:

1. authenticated bootstrap seeds required local catalogue data;
2. offline restart allows cached catalogue search;
3. free workout can add cached exercise offline;
4. cached planned workout can start offline;
5. Machine Profile can be created and used in a set offline;
6. process restart restores active workout + agenda + drafts;
7. access token expires while network is unavailable -> local workout continues;
8. refresh explicitly rejected when online -> protected local account access ends but unsynced partition is preserved unless deletion is confirmed;
9. explicit logout during provider/network failure still clears local continuity immediately;
10. user A logs out with pending outbox -> user B cannot render/send A data;
11. A signs in again -> A partition restores;
12. account deletion warns about unsynced local data;
13. confirmed account deletion removes local A partition/outbox;
14. server completes deletion but response is lost -> restart stays deletion-pending and terminal deletion can still be reconciled without normal refresh;
15. restart during deletion does not resume normal workout mode for that partition;
16. stale cached plan state A session retains A provenance after server B exists;
17. inactive exercise remains valid historical reference;
18. Save as Template works offline and syncs later;
19. session created from still-unsynced local template waits on template create dependency;
20. cross-device continuation is not falsely offered as guaranteed.

---

## 25. Explicitly unresolved

Still open:

- whether catalogue bootstrap is bundled, API-seeded or hybrid;
- exact cache schema/cursors;
- exact amount of recent history cached for recommendations;
- optional local encryption beyond platform/app sandbox protections;
- exact account-switch UX;
- exact deletion-warning wording;
- broad offline plan authoring;
- cross-device active-session continuation.

These must not weaken the required continuity/security behavior.

---

## 26. Acceptance

Product Owner + Security approval of this contract explicitly approves:

1. offline continuity after prior authenticated bootstrap;
2. account-partitioned local user data;
3. locally cached canonical catalogue sufficient for core exercise selection/logging;
4. cached active plan/template data sufficient to start planned workouts offline;
5. Machine/Gym entities as local-first data;
6. temporary refresh/network failure -> local-only continuity, not immediate sign-out;
7. definitive refresh rejection/revocation -> protected local account access ends;
8. ordinary logout preserves but hides unsynced partition data by default;
9. confirmed account deletion purges the subject's local workout/outbox/cache partition;
10. narrow offline Save-as-Template support;
11. same-device active-workout continuity is required;
12. seamless cross-device active-workout continuation is not an M3 guarantee.

Approval does not authorize final cache schema, API endpoints or cryptographic storage design.

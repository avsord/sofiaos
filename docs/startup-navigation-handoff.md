# Sofia OS — startup/navigation handoff, 2026-10-08

## Current work: 0.3.62 local-first manual delivery

The user reported that 0.3.61 remained slow and explicitly prioritized startup over fade. Home must already contain the current-month agenda and tasks; Chat must open with saved recent messages. Older conversations must stay preserved. The user authorized one candidate APK delivered directly for phone testing, without updater publication.

Base remote commit: bfea46be70a38e8b650ef0c13f0127e55fe127b2, delivered 0.3.61/code66. Candidate: 0.3.62/code67, same package/channel/signing configuration. A separate encrypted account-scoped launch projection restores current-month agenda, tasks, Home metadata and recent conversation without parsing all retained history. First upgrade falls back to the legacy archive and creates the projection. Before writes, deferred archive hydration merges older data so a lightweight launch cannot replace it. Live bootstrap waits for the visible Home; backgrounding flushes the saved projection. No fade or server changes.

Local full app tests and the 11 focused launch/cache tests passed. The latter cover retained recent messages, agenda/tasks, legacy migration, saving after lightweight hydration, explicit deletion and account isolation. Fixture size reductions are not device timing results. Manual CI reuses the retained 0.3.60 QA APK only to seed an isolated emulator, then installs the exact 0.3.61 production APK and this candidate in place, offline. It compares cold-start markers and checks Home agenda and a real Chat menu tap with retained synthetic messages. No second APK is compiled; no real user account or physical-device result is fabricated. Compilation and native acceptance remain pending until the current run confirms them.

## Current work: 0.3.61 manual delivery
User requested one production APK sent directly, without publishing on the updater channel. Base: 6c09f5e04fced6d507e0e2d33eee16e52ead031d; version 0.3.61/code66 prepared. This section supersedes the older delivery target below; no new build result is presumed.

Changes: production SofiaLaunchTransition.java coordinates data readiness with Android's splash callback, preventing premature completion for both callback orders. Configuration/retry recreation without a starting window is handled separately. The actual Java class is compiled and executed in a JVM regression test. Home monitoring and adjacent-month warming wait for visual completion; tasks/current month remain in the essential path. No data/cache/authentication deletion.

Manual delivery uses the existing workflow with an explicit [manual-apk] commit marker. Full app tests, isolated backend tests, package/signature/version checks, one production build and production-APK upgrade/login/native-transition smoke run; no separate QA APK and no release publication. The normal official route and physical-device gate remain unchanged. Manual smoke does not test authenticated Home, physical-device speed or the owner's real records. Preserve this distinction in the delivery report.

Delivery diagnosis: prior run 37809157208 spent 274 s in production build, 41 s building QA, and 500 s in the navigation emulator step. About 101 s prepared SDK/emulator and booted; the native Python suite ran approximately 382 s. Both native shards were already parallel. Many checks repeatedly dump Android's complete UI tree. This identifies work/overhead, not a measured gain for the new route. Internal OpenAI cache, chat history and file length have no demonstrated causal attribution. As checked on 08/10, public OpenAI status reported operational, which does not exclude an individual-session issue.

Project entry point: SOFIA_MASTER.md, then only the relevant Sofia Delta route. Do not reread historical masters for every change. The companion consolidated master preserves old sources separately.

## Current deliverable: 0.3.60 candidate, not promoted

Base branch commit: 089c97e2aac31b0db5204e0a9b5d0f927a40ec0e (0.3.59 runtime plus documentation).
Change commit: b1810474986b832fc7015ad6a409a3ce6dd80b7a.
Exact compiled source: 60ee20d7a6333cf235d60cb1ff5acb877817d285 (CI-aligned version metadata).
Run: https://github.com/avsord/sofiaos/actions/runs/37809157208
Successful build job: 113421197079.
Artifact: 11564921396, Sofia-build-37809157208-1.
Production APK: 51,599,876 bytes; SHA-256 18fb2a5f3a4d541fe6bed174a7751890227ee172a10627ee7624bd33807d8652.
Package com.avsord.sofiaapp; versionCode 65; versionName 0.3.60.
Certificate SHA-256 fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c, matching the preceding installed-candidate/published signing identity.

Deliver Sofia-OS.apk as an explicitly unapproved candidate, never QA-ONLY-full-fixture.apk. The extracted production bytes match both the SHA-256 file and sealed bundle. Changed runtime/test files in the compiled source ZIP match the locally tested files byte-for-byte. The manually staged SOFIA_APP tree also matched local git hashing before the atomic delivery-branch update.

## Confirmed causes and focused changes

1. Any DELETE previously discarded all non-chat startup snapshots, even before server success. Acknowledged task/entity removal now reconciles only affected cached rows. Failed deletions preserve the existing snapshot. A second request-generation fence prevents reads begun during deletion from repopulating removed rows. Chat erasure remains explicit and scoped.
2. The 32-entry retention order previously allowed secondary history windows to evict Home/Tasks/Agenda. These essential reads now rank ahead of secondary detail windows. Schema 1, storage keys, encryption, account scope, age policy and size/entry limits are preserved. A deterministic before/after test with 50 history windows reproduced loss of all three essential paths in 0.3.59 and retention of all three after the change. This is a cache regression test, NOT an Android speed benchmark.
3. Home previously held a successfully resolved task list behind Promise.all with a slow Home summary. Independent read callbacks now publish each result immediately. Failed reads are not converted into confirmed empty lists.
4. Layout-based whenInteractive remains permission for essential network progress. New whenRevealed is a separate visual-completion fence: hidden-screen warming, BackgroundServices module mounting and optional notification inventory no longer compete under the S. Existing notification scheduling logic was not removed or rewritten. Selected tabs remain directly mountable.
5. The user explicitly requested a short fade. The original Android 12+ splash now fades opacity over the real app for a configured 120 ms, with no minimum splash dwell or second logo. Legacy Android fades the actual content over its existing window drawable. Cancellation, disabled Android animations and explicit error recovery are handled. LOCAL_READY and FADE_START diagnostics distinguish readiness from the final DATA marker, which includes the fade.

## Completed validation and remaining acceptance

CI with locked dependencies passed TypeScript, 352/352 app tests, 165/165 isolated backend tests, 17/17 delivery tests, production Gradle compilation, package/version/certificate checks, separate QA fixture compilation and sealed artifact retention.

The 13 new tests cover independent slow/failed reads, snapshot retention, scoped deletion, late reads, bridge visibility/cancellation and static native-fade contracts. They include pure logic/mocks/source assertions, not handset visual proof. Final local focused checks passed 35/35; broader startup checks 106/106; native-delivery contract unit tests 10/10. The local full suite's absent React Native dependency check was not suppressed; CI installed the locked runtime and passed the complete suite.

Read-only follow-up on 2026-10-08: native navigation job 113424502110 and workspace job 113424502179 completed successfully. Release job 113428338504 failed at publish-release.cjs because the required physical-device acceptance report was absent. Run 37809157208 finished with failure at 16:45:54 UTC; 0.3.60 was not promoted. The authenticated emulator suite uses the separate synthetic-transport fixture; these passes are not production-handset startup evidence. Reuse the retained APK rather than rebuilding identical code to obtain a report that requires actual device validation.

No physical device was available. Full icon-to-verified-interaction timing, 20 cold starts, 100 native sequences with representative real records, white-frame continuity through the fade and real-account in-place upgrade remain unproved for 0.3.60. No whole-app speed factor or <=1000 ms phone guarantee is claimed. Cache projections already missing in an older installation must be reconstructed from the legitimate origin, never fabricated.

## Earlier relevant state

Published baseline at inspection: 0.3.57, code 62, run 37789662903. Its two synthetic DATA samples 1583/1255 ms failed the requested 1000 ms goal despite smoke success.

0.3.58: source 724c70139cca79e59ca5dabfa041009d6a92e895; code 63; run 37797262718; APK e334175fafa00437d16721773274a2be2624f27993c71c581416740bd73d6ff8. Removed competing native menu writes and retained the original system splash. Its subsequent native passes are not evidence for a different APK.

0.3.59: source 164e973858852f20a96f477cf983987c192a94a8; code 64; run 37804038235; APK c946d2fc1fe219805eaf664c0d794b83c9e15e3d1cfc7fe50e23e2743d6c587e. Added early one-use session/preferences reads, bounded snapshot serialization and deferred speech/update discovery. 339 app tests passed. No physical acceptance was supplied. Historical detailed reports remain in repository history.

## Safety and publication boundary

No backend, database, main branch, credential, encryption implementation, package or updater-channel mutation was made by this change. Install candidates in place; do not uninstall or clear data. Matching signing identity is necessary but does not by itself prove preservation of the owner's displayed records.

startup-release-gate.cjs remains unchanged and requires SOFIA_APP/dist/startup-navigation-acceptance.json for the exact source/APK. Never synthesize it from unit-test fixtures, ready markers or QA transport. Missing physical acceptance intentionally blocks approved publication. This is an installable candidate, not an approved release.

## Sofia Delta follow-up — 2026-10-08
Use [Sofia Delta](sofia-delta.md) for subsequent changes. This review changes instructions only; no runtime optimization or new APK is claimed.

Measured delivery: build job 435 s; native navigation 515 s and workspace 442 s in parallel; release job 39 s; total run 1001 s including inter-job overhead. Gradle reused 124 production tasks and 343 QA tasks were up-to-date. No cache corruption was demonstrated, so no cache was purged. OpenAI internal caches are outside this repository's control.

Source inspection confirmed the configured 120 ms fade and the 0.3.60 cache/initialization changes. It also found a possible fade-skip ordering: on Android 12+, if reveal's posted callback runs before exitSystemSplash is assigned, completeReveal marks the app visible; a later system-splash callback then removes the splash immediately. This is a static code-path finding, not reproduction on the user's phone; inspect LOCAL_READY, FADE_START and DATA timing plus video before asserting the cause. Disabled animations and warm starts are separate intended cases.

The fade-specific unit test checks source strings and bridge mocks, not this native callback ordering or a visible transition. Home's native ready marker still requires tasksReady and calendar.loadedAt; missing local records can therefore leave network completion in the launch path. The exact contribution to the user's delay remains unmeasured. Do not report a source edit or passed mock as a demonstrated visual fix.

The [official OpenAI status page](https://status.openai.com/) reported operational when checked. The [Codex/Work degradation on October 7](https://status.openai.com/incidents/01M4BP5JE7DKJSP3VG2S2DCWF2) was marked resolved. There is no established causal link between that incident and this APK's missing fade or GitHub build/test duration.

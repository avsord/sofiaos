# Sofia OS — startup/navigation handoff, 2026-10-08

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

At the last check, native navigation job 113424502110 and workspace job 113424502179 were still in progress. Do not claim they passed; consult the same run rather than rebuilding identical code. The authenticated emulator suite uses the separate synthetic-transport fixture; a passed marker or that fixture's timings cannot be presented as production-handset startup evidence.

No physical device was available. Full icon-to-verified-interaction timing, 20 cold starts, 100 native sequences with representative real records, white-frame continuity through the fade and real-account in-place upgrade remain unproved for 0.3.60. No whole-app speed factor or <=1000 ms phone guarantee is claimed. Cache projections already missing in an older installation must be reconstructed from the legitimate origin, never fabricated.

## Earlier relevant state

Published baseline at inspection: 0.3.57, code 62, run 37789662903. Its two synthetic DATA samples 1583/1255 ms failed the requested 1000 ms goal despite smoke success.

0.3.58: source 724c70139cca79e59ca5dabfa041009d6a92e895; code 63; run 37797262718; APK e334175fafa00437d16721773274a2be2624f27993c71c581416740bd73d6ff8. Removed competing native menu writes and retained the original system splash. Its subsequent native passes are not evidence for a different APK.

0.3.59: source 164e973858852f20a96f477cf983987c192a94a8; code 64; run 37804038235; APK c946d2fc1fe219805eaf664c0d794b83c9e15e3d1cfc7fe50e23e2743d6c587e. Added early one-use session/preferences reads, bounded snapshot serialization and deferred speech/update discovery. 339 app tests passed. No physical acceptance was supplied. Historical detailed reports remain in repository history.

## Safety and publication boundary

No backend, database, main branch, credential, encryption implementation, package or updater-channel mutation was made by this change. Install candidates in place; do not uninstall or clear data. Matching signing identity is necessary but does not by itself prove preservation of the owner's displayed records.

startup-release-gate.cjs remains unchanged and requires SOFIA_APP/dist/startup-navigation-acceptance.json for the exact source/APK. Never synthesize it from unit-test fixtures, ready markers or QA transport. Missing physical acceptance intentionally blocks approved publication. This is an installable candidate, not an approved release.

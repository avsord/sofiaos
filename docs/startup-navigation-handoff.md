# Sofia OS — startup/navigation handoff, 2026-10-08

## Base and evidence

Base: sofia-app-android at 15e628d7699429d5ec8a5445bc47f55f2e9eb24c (published 0.3.57, com.avsord.sofiaapp, versionCode 62).
Existing run: 37789662903; production APK SHA-256 f9a5055466cdf01034eefb1a8eb76750bb2881a7af766b9d19588a19301b72f9.
Its synthetic-transport startup report contains UI samples 1319/1254 ms and DATA samples 1583/1255 ms, target_met=false. Only two samples; not a 20-run matrix, not the owner's phone. The existing smoke threshold was 5000 ms and the release was nevertheless published. Do not relabel that APK as the current correction.

## Confirmed source defects and focused changes

1. SofiaCalendarTouchGuard.immediateMenu wrote native scroll offset plus menu alpha/scale before the React onPressIn handler changed activeTab, pointerEvents and accessibility state. Removed those independent writes. The native hook now observes input only; existing React touch-down selection and gesture guards remain.
2. SofiaLaunchOverlay was only an observer returning true for every initial pre-draw. LocalLaunchGate returns null while local auth/preferences/snapshot load, so the system splash could end before the usable layout. Retain the original Android 12+ system splash until login or Home+local-data readiness; allow layouts/network progress underneath it. On legacy Android, keep the original window drawable and withhold incomplete content frames. No second splash view or artificial minimum wait. A 15-second failure watchdog presents retry without deleting storage; it is not a successful launch.
3. publish-release.cjs now fails closed before any publication write unless matching physical-device acceptance evidence exists. The new validator checks APK/source identity, at least 20 principal cold runs, the requested scenarios, every run <=1000 ms, visual continuity, 100 navigation sequences, compatibility, preserved data and regressions. Unit-test fixtures are explicitly not device evidence.

## Validation completed locally

59 focused existing tests passed (navigation component/model, local launch, responsiveness). Ten new gate/navigation tests passed, including 100 model-level race sequences. Ten native-delivery contract tests passed. Full npm test was attempted: the large 223-test group had 222 passes and one environment failure because the locked react-native RefreshControl source is not installed in this container. Do not report a full typecheck or native Android validation from these local tests. CI npm ci/typecheck/production build/native checks remain required.

## Safety and delivery

No persistence format, encryption, credentials, backend, main branch, installed package or updater channel was changed. The normal delivery planner must choose the next unused version/code; do not hand-pick or overwrite an existing release. Build artifacts can be retained as candidates, but this task is NOT accepted until the requested actual-device evidence exists. No physical phone or ADB device is available in the working container. New performance, visual continuity and real-data upgrade results are still unmeasured.

The release report is expected at SOFIA_APP/dist/startup-navigation-acceptance.json. It must be supplied from real measurements of the exact production APK, never copied from the validator's test fixture. Missing evidence is an intentional publication block, not permission to disable the gate.

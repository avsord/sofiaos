# Sofia OS — startup/navigation handoff, 2026-10-08

## Base and evidence

Base: sofia-app-android at 15e628d7699429d5ec8a5445bc47f55f2e9eb24c (published 0.3.57, com.avsord.sofiaapp, versionCode 62).
Existing run: 37789662903; production APK SHA-256 f9a5055466cdf01034eefb1a8eb76750bb2881a7af766b9d19588a19301b72f9.
Its synthetic-transport startup report contains UI samples 1319/1254 ms and DATA samples 1583/1255 ms, target_met=false. Only two samples; not a 20-run matrix, not the owner's phone. The existing smoke threshold was 5000 ms and the release was nevertheless published. Do not relabel that APK as the current correction.

## Confirmed source defects and focused changes

Change commit: b49cc34584fc0b4a903bffc2483c0fd541a8b0df.

1. SofiaCalendarTouchGuard.immediateMenu wrote native scroll offset plus menu alpha/scale before the React onPressIn handler changed activeTab, pointerEvents and accessibility state. Removed those independent writes. The native hook now observes input only; existing React touch-down selection and gesture guards remain. This removes a confirmed competing writer; reproduction/absence of the reported visual reversal on the owner's phone remains unverified.
2. SofiaLaunchOverlay was only an observer returning true for every initial pre-draw. LocalLaunchGate returns null while local auth/preferences/snapshot load, so the system splash could end before the usable layout. Retain the original Android 12+ system splash until login or Home+local-data readiness; allow layouts/network progress underneath it. On legacy Android, keep the original window drawable and withhold incomplete content frames. No second splash view or artificial minimum wait. A 15-second failure watchdog presents retry without deleting storage; it is not a successful launch. Native ready markers remain diagnostics, not proof of full icon-to-interaction time.
3. publish-release.cjs now fails closed before any publication write unless matching physical-device acceptance evidence exists. The validator checks APK/source identity, at least 20 principal cold runs, the requested scenarios, every run <=1000 ms, visual continuity, 100 navigation sequences, compatibility, preserved data and regressions. Unit-test fixtures are explicitly not device evidence.

## Built candidate and completed CI validation

Version 0.3.58; versionCode 63; package com.avsord.sofiaapp.
Exact sealed APK source: 724c70139cca79e59ca5dabfa041009d6a92e895 (includes automatic version preparation).
Workflow: https://github.com/avsord/sofiaos/actions/runs/37797262718
Build job: 113379840623, completed successfully.
Retained artifact: 11559636811, Sofia-build-37797262718-1.
Production APK: 51,593,164 bytes; SHA-256 e334175fafa00437d16721773274a2be2624f27993c71c581416740bd73d6ff8.
Signing certificate SHA-256: fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c, matching the 0.3.57 baseline.

Completed with locked dependencies in CI: TypeScript check; 326/326 app tests; 165/165 isolated backend tests; 17/17 delivery tests; production Gradle build; increasing package version and matching signature validation; separate QA fixture build; source/APK bundle hashes. The delivered candidate is Sofia-OS.apk, NOT QA-ONLY-full-fixture.apk.

Earlier local tests also included 59 focused existing checks and 10 new gate/navigation tests. The local full-suite missing-React-Native-dependency failure was resolved by CI npm ci: all 326 app tests passed there. The 100-sequence tests here are model-level tests, not the required native-device acceptance matrix.

At this report's last check, native navigation job 113383007649 and workspace job 113383007764 were still running. No native pass, physical-device upgrade or new startup timing is asserted by this report. Consult that same run for subsequent job results; do not recompile identical source just to poll status.

## Safety, publication and remaining acceptance

No persistence format, encryption, credentials, backend, main branch, installed package or updater channel was changed. The existing expo-sharing dependency declaration was pinned to the same locked 57.0.22 version; no runtime dependency upgrade was introduced.

This APK is a retained candidate, NOT a promoted or accepted release. There is no physical phone/ADB device available to this session. The required 20 cold starts and 100 native navigation sequences, complete <=1000 ms startup, visual continuity and data-preserving upgrade with representative account records remain unproved. Passing compilation and unit tests does not satisfy them.

The publication report is expected at SOFIA_APP/dist/startup-navigation-acceptance.json. It must come from real measurements of this exact production APK/source, never from the validator's unit-test fixture or a synthetic-transport QA build. Missing evidence intentionally blocks publication; do not disable the gate to label the candidate approved.

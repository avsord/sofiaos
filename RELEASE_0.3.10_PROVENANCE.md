# Sofia Android 0.3.10 / Server 141 release snapshot

This release snapshot combines the exact validated Android source subtree from `5a9f8d53f9cebfb02289807da4950ced025da38b` (SOFIA_APP tree `bbc6733c78b737958555377f657fc4ac4cfed370`) with the already deployed server source from main `7ba78586488ebdfda2ba2ef21514db40c483e3c4`. It does not alter main or the isolated Android development branch, and does not introduce or change workflow files relative to main.

The Android binary was built and successfully upgrade-installed over 0.3.9 in Actions run `37018099524`, job `110873888988`. Full TypeScript validation, 66 model/interaction tests, native compilation, bundled-JavaScript validation and emulator upgrade/login launch all passed. Only the release publication step failed with an integration permission error; the validated binary and evidence were retained unchanged as artifact `11232122313`.

APK SHA-256: `d36c7372c9f7886df9de2e5a5cb4459caf61d1c8f282eceaedaf9ad83c7f384f`.
APK size: 49,785,780 bytes.
Package: com.avsord.sofiaapp. Version: 0.3.10. versionCode: 15.

The publication-only workflow verifies the original successful build steps, exact source tree, source commit, APK hash and deployed server version before publishing this same APK without rebuilding. Server tests: 148 passed. Physical-device interaction latency/FPS was not measured. Existing auth, privacy keys and signing identity remain unchanged.

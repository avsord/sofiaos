# Exact Android 0.3.12 source transport

source.b64 transports one Brotli-compressed JSON object with a readable unified diff and a before/after SHA-256 manifest for 18 Android source, test and version files. apply.cjs validates the archive and all source checksums, rejects concurrent changes and paths outside SOFIA_APP, preflights git apply, and verifies the output. It is never imported into the application. CI commits the resulting readable source before compiling; an already applied exact source is a no-op.

Base Android subtree: 2eb4b6366bed850e5d4b3bac0e12095488f086de (b79f8a564b0282a293b87e571fd7788da0d7f368). Decompressed archive SHA-256: ec3df94f79bf2cf3b7e501b0c83467eb7f641f8ee3d95bbc0005d0c808e00c9a.

The user withdrew the speed change: all spring constants and native deceleration remain unchanged. Scope is initial native pager alignment, faint empty-page placeholders and right-aligned undo/redo tools. No server, credentials, private-filter, signing, storage migration or history deletion is part of this release. The existing 0.3.11 update algorithm is unchanged except the installed version constant.

Local checks: original source subtree identity matched; patch applied to a clean copy with all output checksums matching; 9 existing chat-model tests plus 89 app/interaction tests passed. Native/type/build checks run in CI. CI builds a separate non-published fixture APK with real components and synthetic data for initial layout/gesture/editor regression tests, then validates the production APK over 0.3.11. After publication it tests the original 0.3.11 updater and the Atualizar dialog inside the original published 0.3.11 APK. No production account or real user data is used by the fixture.

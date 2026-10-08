# Sofia Android — native client

Native React Native / Expo client. No WebView; no Meta dependency for app chat. Uses the same Sofia owner account and backend; credentials and provider keys are never embedded. Target server is the public EXPO_PUBLIC_API_URL.

The app includes native login, text and voice conversation, shared account history, interactive agenda, tasks, notifications, profile, session management, and schema-driven CRUD for the existing Sofia workspace catalog (pages, lists, studies, library, purchases and monitor records).

This is not a claim of complete parity with every advanced desktop editor gesture or that WhatsApp is already activated. Push notifications with the app closed, offline sync, and external calendar sync are not enabled. Advanced rich tables retain their existing data but are not edited as desktop tables. The app requires the matching mobile backend endpoints to be deployed.

Run npm install, npx expo install --fix, npm run prepare-assets, npm run check, npm test, and npx expo prebuild --platform android. The Actions workflow creates a standalone release-mode APK with embedded JavaScript and tests startup on Android. The initial APK uses a development signing certificate for internal validation only, not a production Play Store signing key.

Do not place .env secrets, password resets, personal messages, backend data, or private signing material in this source directory. History comes from authenticated API requests; no canned AI replies are supplied by the application. Unit-test providers do not validate the owner's live provider credentials.

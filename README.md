# OmniForge

An offline-first Android workspace built with React Native, Expo, and TypeScript. This first milestone focuses on dependable image operations and local file handling.

## What works

- Convert JPEG or PNG images to JPEG or PNG. Outputs are saved as separate local files.
- Compress a JPEG or PNG into a JPEG with a selectable quality setting (45%, 72%, or 90%). Some source images will not shrink; PNG transparency is lost in JPEG output.
- Create a PDF page from one JPEG or PNG image using the device print engine.
- Import an existing PDF into the local library, browse recent files, share outputs through the Android share sheet, and clear saved files.
- Store recent file records and JPEG quality locally. Processing does not require an account or an internet connection.

PDF text editing, page rearrangement, font preservation, batch conversion, and arbitrary file conversion are **not supported**. Imported PDFs can be stored and shared; they cannot be edited.

## Requirements

- Node.js 20 or newer and npm
- Android device or emulator with Expo Go for development
- For native builds: JDK 17 and Android SDK, or a configured Expo Application Services account

## Install and develop

```sh
npm ci
npm start
```

Open the QR code with Expo Go, or run `npm run android` with an Android emulator connected. The Android app package is `com.omniforge.app`.

## Validate

```sh
npm run typecheck
npm test -- --watch=false
npm run export
```

`npm run export` verifies that the Android JavaScript bundle builds. Unit tests check supported formats, output naming, local record persistence, conversion options, and image embedding for PDF generation. Device integration still needs a physical Android device or emulator.

## Build an Android APK

With JDK 17 and the Android SDK installed:

```sh
npx expo prebuild --platform android --no-install
cd android
./gradlew assembleDebug
```

The debug APK is written to `android/app/build/outputs/apk/debug/app-debug.apk`. GitHub Actions runs this build and uploads the APK as an artifact on pull requests. To create a signed release build, configure Android signing separately.

## Structure

- `App.tsx` — responsive screens and shared interface elements
- `src/core/files.ts` — local file picking, conversion, PDF creation, storage, and sharing
- `src/core/types.ts` — file and settings interfaces plus pure helpers
- `__tests__/` — automated unit tests
- `.github/workflows/validate.yml` — CI checks and debug APK build

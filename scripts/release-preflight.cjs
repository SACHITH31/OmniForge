const { expo } = require('../app.json');

const tag = process.argv[2];
const versionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*)?$/;
if (!versionPattern.test(expo.version) || tag !== `v${expo.version}`) {
  throw new Error('The release tag must match the Expo version and use semantic versioning.');
}

if (expo.android?.package !== 'com.omniforge.app') {
  throw new Error('The Android package must remain com.omniforge.app.');
}

const code = expo.android.versionCode;
if (!Number.isSafeInteger(code) || code < 1 || code > 2100000000) {
  throw new Error('Set a positive, explicitly assigned Android versionCode before tagging.');
}

console.log(`Verified candidate metadata for ${tag} (Android versionCode ${code}).`);

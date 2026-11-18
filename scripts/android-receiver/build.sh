#!/usr/bin/env bash
set -euo pipefail
tools_dir="$ANDROID_HOME/build-tools/36.0.0"
platform="$ANDROID_HOME/platforms/android-36/android.jar"
work="$(mktemp -d)"
mkdir -p "$work/classes" "$work/dex"
javac --release 8 -cp "$platform" -d "$work/classes" scripts/android-receiver/ReceiverActivity.java
"$tools_dir/d8" --lib "$platform" --min-api 23 --output "$work/dex" "$work/classes/com/omniforge/qa/ReceiverActivity.class"
"$tools_dir/aapt2" link --manifest scripts/android-receiver/AndroidManifest.xml -I "$platform" -o "$work/unsigned.apk"
(cd "$work/dex" && zip -q "$work/unsigned.apk" classes.dex)
"$tools_dir/zipalign" -f 4 "$work/unsigned.apk" "$work/aligned.apk"
keytool -genkeypair -keyalg RSA -keysize 2048 -validity 30 -dname CN=EmulatorQA \
  -keystore "$work/test.p12" -alias emulator-qa -storepass emulator-only
"$tools_dir/apksigner" sign --ks "$work/test.p12" --ks-pass pass:emulator-only \
  --out "$1" "$work/aligned.apk"

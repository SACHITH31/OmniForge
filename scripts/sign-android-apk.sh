#!/usr/bin/env bash
set -euo pipefail

: "${ANDROID_RELEASE_KEYSTORE_B64:?Missing keystore}"
: "${ANDROID_RELEASE_STORE_PASSWORD:?Missing keystore password}"
: "${ANDROID_RELEASE_CERT_SHA256:?Missing expected signer fingerprint}"

input="${1:?Input APK is required}"
output="${2:?Output APK is required}"
test "$input" != "$output"
signer="$ANDROID_HOME/build-tools/36.0.0/apksigner"
expected="$(printf '%s' "$ANDROID_RELEASE_CERT_SHA256" | tr -d ':' | tr '[:upper:]' '[:lower:]')"
[[ "$expected" =~ ^[0-9a-f]{64}$ ]]

key="$(mktemp "${RUNNER_TEMP:-/tmp}/omniforge-signing.XXXXXXXX")"
trap 'rm -f -- "$key"' EXIT
printf '%s' "$ANDROID_RELEASE_KEYSTORE_B64" | base64 --decode > "$key"
"$signer" sign --ks "$key" --ks-type PKCS12 --ks-key-alias omniforge-release \
  --ks-pass env:ANDROID_RELEASE_STORE_PASSWORD --v4-signing-enabled false \
  --out "$output" "$input"
result="$("$signer" verify --print-certs "$output")"
actual="$(awk '/^Signer #[0-9]+ certificate SHA-256 digest:/ { print tolower($NF) }' <<< "$result")"
if [[ "$actual" != "$expected" ]]; then
  rm -f -- "$output"
  echo 'The APK does not have the expected single signer.' >&2
  exit 1
fi
printf '%s\n' "$result"

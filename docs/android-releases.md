# Android release process

Treat `main` as the release source. Review and merge completed feature pull requests with a merge commit, then check the build for the merge SHA. Development artifacts are `CRBA.apk` and use the runner's test certificate.

## Prepare a candidate

1. Select the next semantic version and set the same value in `app.json` and `package.json`. Keep the npm lockfile in sync. Set an explicit Android `versionCode` greater than every published code. The first unassigned code is 1.
2. Move completed entries in `CHANGELOG.md` from Unreleased into the version's entry. Link to the actual release once it exists.
3. Confirm that the exact commit passed tests and Android checks on `main`. Push an annotated tag that matches the Expo version. The candidate workflow checks the tag type, source commit, ancestry, package ID, and version contract.
4. Inspect the candidate's CI logs, APK metadata, and checksum. Verify the archive's `source-commit.txt` matches the tag's peeled commit.

## Enable permanent signing

Configure the protected `android-release` GitHub Actions environment after the release owner verifies the keystore backup. Limit it to trusted version tags and require review as appropriate.

| Configuration | Purpose |
| --- | --- |
| Repository variable `ANDROID_RELEASE_SIGNING_ENABLED` | Enable signing only after readiness checks are complete |
| Environment variable `ANDROID_RELEASE_BACKUP_CONFIRMED` | Set to `true` after retrieving and checking the backup |
| Environment variable `ANDROID_RELEASE_CERT_SHA256` | Independently obtained certificate fingerprint |
| Environment secret `ANDROID_RELEASE_KEYSTORE_B64` | Base64 representation of the approved PKCS#12 keystore |
| Environment secret `ANDROID_RELEASE_STORE_PASSWORD` | Password for the PKCS#12 keystore and its `omniforge-release` entry |

Keep key material outside source control. The workflow compares the signed APK certificate against the configured fingerprint and runs the emulator workflow against the signed candidate. Normal validation exercises the signing script with a disposable key.

## Publish after verifying upgrade compatibility

Candidate signing produces a versioned APK and SHA-256 file. GitHub Release publication and the upgrade test against the prior public APK are pending automation. For a release after the baseline, install the previous public APK with representative saved files, update it with the new candidate, and confirm the library and settings survive. Check that the package ID and signer match, and that the candidate version code is higher. Explain the separate compatibility of development APKs, which may require an uninstall and loss of local app data.

Start the release page with the actual APK asset link and file name. Follow with channel, date, verified Android minimum, size, and SHA-256. Include what's new, features, UI changes, fixes, measured performance changes, Android coverage, privacy and security, limitations, install and upgrade instructions, CI results, signer fingerprint, tag and commit, the full changelog, and upcoming work. Attach the versioned APK and `SHA256SUMS.txt`. Verify the published assets and their hashes before announcing a release. Do not move a published tag.

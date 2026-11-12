# Dark-mode App Store assets

Prepared 12 November 2026 for the English Sync listing. Generated assets live in `artifacts/app-store/2026-11-12/`, excluded from Git and EAS uploads. Capture provenance belongs in `capture-provenance.json`; the screenshot manifest records dimensions, source/output SHA256 values and file checks. Local simulator screenshots are suitable draft listing assets. Compare them with the selected distribution build before treating them as final release evidence.

## Source and build boundary

The source comparison `git diff --stat f1bfac6..da7339f` contains five changed files: `.easignore`, `.gitignore`, `docs/release-preflight.md`, `package.json` and `package-lock.json`. No `App.js`, `src/` or artwork files changed. The dependency change explicitly pins `react-native-worklets` to `0.5.1`, replacing the previous lockfile's `0.6.1` peer resolution. The other changes concern build-source packaging, credential-file exclusion and release documentation.

That comparison supports using captures of the existing Release UI as draft store content; it does not establish native equivalence. A previously built simulator app may still contain Worklets `0.6.1`. Verify the captured binary's provenance separately, then compare or recapture against the intended final CNG/distribution archive with Worklets `0.5.1`. A simulator app and a source diff do not prove the selected App Store binary, signing or final archive behavior.

The delivered iPhone set uses the earlier Release simulator binary; its exact original source commit was not independently established. The iPad set uses the CNG Release app at `/private/tmp/syncapp-cng-native-check/derived/Build/Products/Release-iphonesimulator/Sync.app`, with Worklets `0.5.1`. Its installed executable and JavaScript bundle hashes match that source app. This guest-only binary uses synthetic public runtime settings, and is not an account, cloud or billing test. Both per-device records are embedded in `capture-provenance.json`.

## Technical export verification

Run `python3 scripts/package-app-store-screenshots.py` after both device sets are complete. It preserves untouched native captures under `en-US/{iphone,ipad}/raw/` and exports ordered files under `upload/en-US/{iphone,ipad}/`. It refuses unsupported native sizes and any nonopaque source pixels. Fully opaque RGBA PNGs can lose their alpha channel while retaining every original encoded RGB sample and the ICC profile. RGB sources are copied unchanged. Upload files are never resized, cropped, composited or given fabricated UI. The separate contact sheet contains reduced QA previews.

The selected root is canonicalized, so `/tmp` paths and an explicitly selected root symlink remain usable. Locale names must be a single safe path component and cannot be `upload` in any letter case. Before export, the script rejects symlinks or paths escaping that root in raw inputs, the existing upload tree, package metadata and generated output files. This also prevents following an existing output symlink back into the raw captures.

An independent temporary-root check of fresh iPhone shots 01 and 02 passed on 12 November: both remained **1206 × 2622**; source alpha samples were all 255; output PNG color type was 2 (RGB), with no transparency chunk. Pillow comparison found every decoded RGBA byte equal, with identical ICC data. SHA256, ZIP CRC and ZIP-member hash checks passed. The plain report is `artifacts/app-store/2026-11-12/packaging-validation.json`. This check did not modify the live upload folder and does not establish visual approval or an App Store upload.

Keep Spotify, background-workout execution and unverified paid access out of the listing. Use the actual guest UI and genuinely completed sessions for any Activity capture. Screenshot specifications and required slots must match [Apple's current screenshot reference](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications) at upload.

## App Store receipt

App Store Connect app `6833659501`, iOS version **1.0**, English (U.S.) was updated on 12 November 2026. Promotional text, the 845-character description and keywords from `metadata-en-US.json` were saved. Existing support/marketing URLs, account/review credentials, privacy answers and release settings were left as found.

The **Dynamic Island medium** screenshot slot visibly contains four dark iPhone PNGs, ordered Ready → active timer → Training → routine editor. Each is 1206 × 2622. The duplicate Ready asset was removed from the product-page set; the confirmation stated that it remains in Asset Library. The saved page shows **4 of 10 App Screenshots**. Evidence: `artifacts/app-store/2026-11-12/qa/app-store-iphone-upload.jpg`.

The **13-inch iPad** slot now also visibly contains four native dark PNGs, ordered Ready → active timer → Training → routine editor, each **2064 × 2752**. Actual upright orientation was checked in every delivered PNG; two earlier upside-down captures were excluded and never uploaded. The existing isolated guest QA device retains its five genuine saved routines, including Learn Italian and Release check; no storage or history was fabricated. Evidence: `artifacts/app-store/2026-11-12/qa/app-store-ipad-upload.jpg`. The page shows **4 of 10 App Screenshots** and a saved checkmark.

The final local package contains **8 opaque RGB PNGs**, their hashes and capture records, English copy, the Turkish upload guide and `upload-receipt.json`. These are draft listing edits; no Add for Review, App Review submission or public release was performed in this asset task. The separate distribution-build evidence belongs to `ios-build-1.0.0-2-evidence.json`.

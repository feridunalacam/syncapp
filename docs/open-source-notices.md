# Open-source and third-party notices

Profile → **Open-source notices** opens a local, searchable list. Each entry opens
its complete notice text in the existing themed sheet. These notices are imported
as runtime JSON by the Profile component; viewing them requires no account,
network request or external website. They apply to the next candidate containing
this source change, not retrospectively to the privately uploaded build 8.

## Observed gap and scope

The inspected build 8 app had no license, notice or acknowledgement file and no
React Navigation, vector-icons or Ionic copyright text or MIT permission clause.
The previous Profile preferences contained Privacy policy and About rows but no
open-source notice entry. In particular, the shipped React Navigation image
assets came from an MIT-licensed package whose notice requires inclusion.

The bounded inventory uses the reviewed build 8 iOS production source map:
98 installed runtime package roots, checked against `package-lock.json`, plus
19 text entries from the installed CocoaPods acknowledgements and the additional
font/native texts below. It is not an inventory of every development dependency.
`scripts/notices/inputs.json` records the source-map hash, package paths and
versions. `scripts/notices/native-notices.json` records the native acknowledgement
and Podfile.lock hashes. Identical notice text is stored once with every
applicable component name retained.

## Shipped asset rights inventory

The build 8 native asset reconciliation identified 22 actual files:

| Asset group                                                       | Count | Notice / provenance                                                                                                                           |
| ----------------------------------------------------------------- | ----: | --------------------------------------------------------------------------------------------------------------------------------------------- |
| React Navigation back, mask, clear, close and search PNG variants |    13 | Installed `@react-navigation/elements/LICENSE`: MIT, Copyright (c) 2017 React Navigation Contributors. Included in runtime notices.           |
| Ionicons.ttf                                                      |     1 | Separate Ionic MIT notice plus the Expo/vector-icons and vendored React Native Vector Icons wrapper MIT notices. Included in runtime notices. |
| Original synthesized workout cue WAVs                             |     8 | Original synthesis provenance is recorded in `docs/alert-sounds.md`; no third-party audio-sample license is asserted.                         |

The actual font is vendored by `@expo/vector-icons` 15.0.3. Its SHA-256 is
`fa2ab7d2557819b2bfe5009e46844efa7170cf177be7735d43aa2ac1295f1d54`, matching
the build 8 asset evidence. The installed wrapper's MIT license credits Joel
Arvidsson and 650 Industries; it does not supply the separate font author notice.
The [upstream Vector Icons documentation](https://raw.githubusercontent.com/oblador/react-native-vector-icons/v10.2.0/README.md)
distinguishes bundled font authors from the wrapper. The included
[Ionic MIT license](https://raw.githubusercontent.com/ionic-team/ionicons/v7.1.0/LICENSE)
credits `Copyright (c) 2015-present Ionic (http://ionic.io/)`.
The installed font metadata does not establish its exact Ionicons release;
the UI therefore identifies its vendoring package rather than assigning a font version.

The 14 English coach recordings were absent from the inspected build 8 native
asset inventory. This notice work does not resolve their separate ownership or
plan/terms question, certify all content rights, or authorize the App Store
Content Rights declaration. See `docs/coach-voice.md` for the separate record.

## License sources

The generator reads complete installed package LICENSE/NOTICE/COPYING files.
For packages whose published archives omit their monorepo license, explicit
fallbacks in the inventory use these verified sources:

- Expo SDK packages: the installed `@expo/config/LICENSE`, checked against the
  [Expo SDK 54 repository license](https://raw.githubusercontent.com/expo/expo/sdk-54/LICENSE).
- React Native monorepo packages: installed `react-native/LICENSE`; their package
  metadata identifies the same repository and MIT license.
- Slider 5.0.1: [the versioned upstream MIT license](https://raw.githubusercontent.com/callstack/react-native-slider/v5.0.1/LICENSE.md).
- RevenueCat hybrid packages 20.4.0: installed PurchasesHybridCommon MIT license,
  checked against [the versioned upstream license](https://raw.githubusercontent.com/RevenueCat/purchases-hybrid-common/20.4.0/LICENSE).

The native snapshot retains the installed CocoaPods acknowledgement text without
promoting proprietary SDK copyright lines to open-source licenses. The complete
installed Google Mobile Ads SDK Open Measurement license is included separately.
The complete Apache 2.0 license is supplied by the mapped `@iabtcf/core/LICENSE`,
alongside the installed RNGoogleMobileAds attribution. This is a bounded notice
inventory, not a legal certification or a complete audit of bundled native SDK
internals and their transitive materials.

## Reproduce and refresh

Without network access or package installation:

```sh
node scripts/generate-open-source-notices.mjs --check
node scripts/generate-open-source-notices.mjs
```

The check verifies each installed and locked runtime package name/version and
compares all generated text with the committed JSON. A missing license text or
version drift fails instead of guessing a license from an SPDX label.

After changing runtime dependencies or imports, refresh the scope from the
reviewed iOS production source map and inspect any new package's primary license:

```sh
node scripts/generate-open-source-notices.mjs --source-map /absolute/path/to/ios-production.jsbundle.map
node scripts/generate-open-source-notices.mjs --check
```

New packages without installed license files require a verified, explicit
fallback before generation succeeds. When native dependencies change, refresh
the native acknowledgement snapshot from the matching CocoaPods plist and
Podfile.lock and review SDK-specific license files. No native build, upload or
release declaration is performed by this script.

## Validation of this change

- Regeneration from the reviewed production source map and `--check` both pass:
  98 runtime packages, 62 distinct complete notice texts, 116,637-byte runtime JSON.
- Metro's production iOS JSON-module transform was evaluated locally. Its runtime
  export preserved the complete JSON, including the full React Navigation and
  Ionic copyright, permission and warranty clauses. The static import chain is
  TabNavigator → ProfileScreen → OpenSourceNotices → openSourceNotices.json.
- The existing account UI and session action/wiring suites passed all 39 tests.
  The Profile VM harness received only a stub for the additional component.
- A Node 22 React renderer smoke check exercised library search, opening the full
  Ionic and React Navigation texts, closing, and reopening with reset search state.
  It made zero network requests.
- No native build or replacement IPA was produced for this change. Inclusion and
  access in the next signed candidate still require that candidate's verification.

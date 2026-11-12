# EAS release configuration guard

Standard EAS builds automatically run `eas-build-post-install` from `package.json`. On Android this follows dependency installation and prebuild; on iOS it also follows pod installation. A failing hook stops the build before native compilation. Custom EAS build workflows must explicitly call the hook themselves. [Expo lifecycle hooks](https://docs.expo.dev/build-reference/npm-hooks/).

The hook checks the actual build process environment, without loading local dotenv files or filling missing values from `eas.json`. `EAS_BUILD=true`, `EAS_BUILD_PLATFORM` (`ios` or `android`), and a known `EAS_BUILD_PROFILE` are required. `EXPO_PUBLIC_BUILD_PROFILE` must match that profile exactly. Unknown or incomplete EAS build identity fails closed. [Expo build variables](https://docs.expo.dev/eas/environment-variables/usage/).

`preview` and `production` reuse the manual release check's backend, platform-specific public RevenueCat key, legal URL, public-secret and enabled-ad configuration validation. Test Store, private and placeholder keys fail. A matched `development` build skips release service checks so the local core remains usable without keys. Running this hook outside an EAS build prints an explicit skip; use `npm run check:release -- --platform ios --profile production` for the separate local/profile check.

Passing verifies configuration format only. It does not verify signing, service availability, real purchases, store approval or a completed cloud build. No environment values are printed.

App Store Connect API access is approved. The active Sync EAS Submit App Manager key is stored and assigned to this app in EAS. The Apple Distribution certificate and app-specific App Store profile were created, downloaded and verified against the prepared key and bundle ID; EAS confirmed that both are assigned and ready to build. The temporary credential transfer file was removed from the checkout. Apple-side CLI key validation was not performed, and real Apple subscription lifecycle/Pro validation remains unverified. Release native Copy image and transparent clipboard checks pass; fresh CNG/native QA remains open after the direct Worklets dependency correction.

## Pinned build tools

The shared EAS base profile selects Node **22.23.4** and the iOS image **macos-tahoe-26.5-xcode-26.6**, matching the locally validated Node/Xcode release toolchain. All three iOS profiles were resolved and validated with the installed EAS 27.7.2 schema/resolver, including the development simulator override. This is configuration validation; a cloud build has not yet run.

Expo's SDK 54 default image currently supplies Node 20.19.4, below this project's Node >=22.13 requirement. The explicit Node selection avoids that mismatch. The named iOS image also prevents an unreviewed move to Xcode 27 through `latest`. [Expo infrastructure](https://docs.expo.dev/build-reference/infrastructure/), [Node/image configuration](https://docs.expo.dev/eas/json/).

Use a Node 22 shell and EAS CLI 27.7.2 or newer for the linked project. The normal command is `npx eas-cli@27.7.2 build --platform ios --profile production`; this command creates a build and should be run only within the available Free quota. For a non-interactive command using a stored API key imported without Apple login, supply `EXPO_APPLE_TEAM_ID` from the Apple account in the shell environment to avoid the Team ID prompt. This uses the existing key without creating broader access. It does not automatically submit to App Store Connect.

## CNG source packaging

The root `.easignore` preserves every current `.gitignore` exclusion, including `/ios/` and `/android/`. Keep those protections synchronized when ignore rules change: EAS uses `.easignore` instead of `.gitignore`. The local native projects remain intact for QA; cloud builds generate native projects from app configuration and plugins. [Expo ignore rules](https://docs.expo.dev/build-reference/easignore/), [CNG](https://docs.expo.dev/workflow/continuous-native-generation/).

The first cloud build exposed a tracked-file conflict: without `.easignore`, EAS 27.7.2 classified Git-tracked native markers as `generic`, while archive filtering excluded their files. The worker consequently reached pod installation without a Podfile. The installed resolver/GitClient now reports `managed` for both platforms with the same local native directories present. An offline archive made with the installed EAS GitClient and tar writer retained the source Git HEAD, app configuration and lockfile, with zero native files or private environment/credential files. Original native files and Git configuration were unchanged. These local checks do not establish that a subsequent cloud Prebuild or signed build has passed.

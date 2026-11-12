# EAS release configuration guard

Standard EAS builds automatically run `eas-build-post-install` from `package.json`. On Android this follows dependency installation and prebuild; on iOS it also follows pod installation. A failing hook stops the build before native compilation. Custom EAS build workflows must explicitly call the hook themselves. [Expo lifecycle hooks](https://docs.expo.dev/build-reference/npm-hooks/).

The hook checks the actual build process environment, without loading local dotenv files or filling missing values from `eas.json`. `EAS_BUILD=true`, `EAS_BUILD_PLATFORM` (`ios` or `android`), and a known `EAS_BUILD_PROFILE` are required. `EXPO_PUBLIC_BUILD_PROFILE` must match that profile exactly. Unknown or incomplete EAS build identity fails closed. [Expo build variables](https://docs.expo.dev/eas/environment-variables/usage/).

`preview` and `production` reuse the manual release check's backend, platform-specific public RevenueCat key, legal URL, public-secret and enabled-ad configuration validation. Test Store, private and placeholder keys fail. A matched `development` build skips release service checks so the local core remains usable without keys. Running this hook outside an EAS build prints an explicit skip; use `npm run check:release -- --platform ios --profile production` for the separate local/profile check.

Passing verifies configuration format only. It does not verify signing, service availability, real purchases, store approval or a completed cloud build. No environment values are printed.

The existing App Manager API key, Apple Distribution certificate and app-specific App Store profile are stored/assigned in the EAS vault. Apple profile fetch through the CLI succeeded with the team environment supplied; no Admin role or additional API key was used. Temporary credential-transfer files were removed from the checkout. Cloud Store build **1.0.0 (2)** and its upload are verified below. Real Apple subscription lifecycle/Pro validation remains unverified.

## Pinned build tools

The shared EAS base profile selects Node **22.23.4** and the iOS image **macos-tahoe-26.5-xcode-26.6**, matching the locally validated Node/Xcode release toolchain. All three iOS profiles were resolved with EAS 27.7.2, including the development simulator override. The successful Store IPA also records Xcode **26.6** and SDK **iphoneos26.5**.

Expo's SDK 54 default image currently supplies Node 20.19.4, below this project's Node >=22.13 requirement. The explicit Node selection avoids that mismatch. The named iOS image also prevents an unreviewed move to Xcode 27 through `latest`. [Expo infrastructure](https://docs.expo.dev/build-reference/infrastructure/), [Node/image configuration](https://docs.expo.dev/eas/json/).

Use a Node 22 shell and EAS CLI 27.7.2 or newer for the linked project. The normal command is `npx eas-cli@27.7.2 build --platform ios --profile production`; this command creates a build and should be run only within the available Free quota. For a non-interactive command using a stored API key imported without Apple login, supply `EXPO_APPLE_TEAM_ID` from the Apple account in the shell environment to avoid the Team ID prompt. This uses the existing key without creating broader access. It does not automatically submit to App Store Connect.

## CNG source packaging

The root `.easignore` preserves every current `.gitignore` exclusion, including `/ios/` and `/android/`. Keep those protections synchronized when ignore rules change: EAS uses `.easignore` instead of `.gitignore`. The local native projects remain intact for QA; cloud builds generate native projects from app configuration and plugins. [Expo ignore rules](https://docs.expo.dev/build-reference/easignore/), [CNG](https://docs.expo.dev/workflow/continuous-native-generation/).

The first cloud build exposed a tracked-file conflict: without `.easignore`, EAS 27.7.2 classified Git-tracked native markers as `generic`, while archive filtering excluded their files. The worker reached pod installation without a Podfile. The corrected resolver/GitClient reports `managed` for both platforms with the local native directories retained. An archive produced by the actual EAS GitClient/tar writer preserved source/configuration/lockfile and excluded native files and private environment/credential files. Original native projects and Git configuration were unchanged.

The subsequent cloud run on source `da7339f` passed **Doctor 18/18, Prebuild, pods, bundling and Fastlane**. EAS Build `015a6833…` finished with Store build **1.0.0 (2)**. This confirms the corrected CNG path through a real signed cloud build.

## Direct native peer and local CNG check

The first Doctor run passed 17/18 and reported missing direct peer `react-native-worklets`, required by Reanimated. It was present only as an auto-installed **0.6.1** peer. The manifest now pins **react-native-worklets 0.5.1** directly, matching Expo 54's bundled mapping; Reanimated **4.1.5**, RN **0.81.5** and the other SDK versions remain unchanged.

A fresh isolated CNG iOS project generated its Podfile, resolved Worklets **0.5.1**, installed pods and passed a normal-signed Release simulator build plus strict codesign verification. Only Worklets differed from the prior native pod versions. The local `/tmp` alias needed a canonical `ENTRY_FILE` build environment value; no generated/source patch was applied. The check used synthetic public runtime configuration and did not copy local dotenv values or modify the original `ios/Pods` project.

Recorded Store-source checks are **496/496 tests** and both Hermes exports. Fresh CNG Worklets 0.5.1 iPad QA subsequently reopened the saved five-second routine, completed its actual countdown/one round, finished, inspected Activity detail and passed Copy image/Copy transparent sticker. Installed executable/JS hashes matched the preserved CNG reference. Pre-pin Worklets 0.6.1 longer sessions, iPad pause/landscape and both-device clipboard passes retain that earlier scope; current-CNG iPhone and actual TestFlight runtime remain open.

Post-upload Profile source `a6099d3` also passed **496/496** tests and a separate normal-signed CNG simulator Release build/strict-deep codesign. Its iPad native AX check exposed the enabled Dark appearance switch and activated **1 → 0 → 1**. Data survived installation; no full VoiceOver audit or new Store build is claimed. Later concurrent worktree edits are outside this recorded source. Synthetic public runtime configuration still does not validate live services.

## Store delivery record

The actual Store IPA passed strict/deep signature verification, App Store provisioning-profile classification, expected team/bundle/version **1.0.0 (2)**, device arm64, `get-task-allow=false`, minimum iOS **15.1** and permission-removal checks. EAS Submit `771ac1eb…` uploaded it to Apple successfully on the Free plan. An earlier attempt using `--what-to-test` was rejected as Enterprise-only **before creating a submit job**; removing that flag allowed the Free Submit to succeed. No paid plan was activated.

Apple processing is complete: `processingState=VALID`, internal `READY_FOR_BETA_TESTING`, external `READY_FOR_BETA_SUBMISSION`, `expired=false`. Live, in-review and pending-release states are empty. The **Sync Internal QA** group now has build **1.0.0 (2)** and only the existing account holder, visibly **Invited**; automatic distribution is disabled. Invitation acceptance and physical-device installation/runtime remain unobserved. No external beta review, App Review submission or public release occurred. The 15 shipped privacy manifests were inventoried; this is not an official Xcode aggregated report or final privacy questionnaire. Real paid/Pro validation and merchant requirements remain open while the owner completes the commercial steps separately.

# EAS release configuration guard

Standard EAS builds automatically run `eas-build-post-install` from `package.json`. On Android this follows dependency installation and prebuild; on iOS it also follows pod installation. A failing hook stops the build before native compilation. Custom EAS build workflows must explicitly call the hook themselves. [Expo lifecycle hooks](https://docs.expo.dev/build-reference/npm-hooks/).

The hook checks the actual build process environment, without loading local dotenv files or filling missing values from `eas.json`. `EAS_BUILD=true`, `EAS_BUILD_PLATFORM` (`ios` or `android`), and a known `EAS_BUILD_PROFILE` are required. `EXPO_PUBLIC_BUILD_PROFILE` must match that profile exactly. Unknown or incomplete EAS build identity fails closed. [Expo build variables](https://docs.expo.dev/eas/environment-variables/usage/).

`preview` and `production` reuse the manual release check's backend, platform-specific public RevenueCat key, legal URL, public-secret and enabled-ad configuration validation. Test Store, private and placeholder keys fail. A matched `development` build skips release service checks so the local core remains usable without keys. Running this hook outside an EAS build prints an explicit skip; use `npm run check:release -- --platform ios --profile production` for the separate local/profile check.

Passing verifies configuration format only. It does not verify signing, service availability, real purchases, store approval or a completed cloud build. No environment values are printed.

## Pinned build tools

The shared EAS base profile selects Node **22.23.4** and the iOS image **macos-tahoe-26.5-xcode-26.6**, matching the locally validated Node/Xcode release toolchain. All three iOS profiles were resolved and validated with the installed EAS 27.7.2 schema/resolver, including the development simulator override. This is configuration validation; a cloud build has not yet run.

Expo's SDK 54 default image currently supplies Node 20.19.4, below this project's Node >=22.13 requirement. The explicit Node selection avoids that mismatch. The named iOS image also prevents an unreviewed move to Xcode 27 through `latest`. [Expo infrastructure](https://docs.expo.dev/build-reference/infrastructure/), [Node/image configuration](https://docs.expo.dev/eas/json/).

Use a Node 22 shell and EAS CLI 27.7.2 or newer for the linked project. Once signing is ready, the normal command is `npx eas-cli@27.7.2 build --platform ios --profile production`; this command creates a build and should be run only within the available Free quota. It does not automatically submit to App Store Connect.

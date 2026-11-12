# Dependency security validation

Validated on 12 November 2026 using the public GitHub source at b034fc4 and a minimal, independently reviewed lockfile candidate. No .env, credentials, local node_modules inventory or private account data was copied into the audit directory. The original audit request was refused by automatic approval review because potentially private dependency metadata had no explicit upload permission. A separate audit was then approved for an isolated copy downloaded through unauthenticated public GitHub URLs; the original lockfile bytes/SHA256 matched the project. npm used --package-lock-only, --ignore-scripts and --userconfig=/dev/null against the official registry.

## Applied compatible updates

| Package                | Previous             | Selected              | Scope                                                                                                                   |
| ---------------------- | -------------------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| @react-navigation/core | 7.21.13              | 7.22.1                | Removes the vulnerable query-string decoder dependency. Existing native navigator and router versions remain unchanged. |
| brace-expansion        | 1.1.18 /2.1.4 /5.0.9 | 1.1.22 /2.1.8 /5.0.13 | Compatible transitive build/test-tool updates across eight lock entries.                                                |
| fast-uri               | 3.1.7                | 3.1.9                 | Compatible Ajv URI-parser update.                                                                                       |
| node-forge             | 1.4.0                | 1.4.3                 | Compatible Expo certificate-tool update.                                                                                |
| source-map-js          | 1.2.1                | 1.2.2                 | Compatible source-map parser update.                                                                                    |
| undici                 | 6.28.1               | 6.29.1                | Compatible Expo CLI HTTP-client update.                                                                                 |

The initial compatible patch updated 13 records and removed 5 unused parser records, with no added packages. All 14 incoming version ranges, published metadata/integrities and Node 22 compatibility were checked independently. That patch retained Expo, React, React Native and native module versions. A later direct Worklets correction is recorded below. The navigation path-length/native-decoding guard remains defense in depth. [Patched core manifest](https://raw.githubusercontent.com/react-navigation/react-navigation/@react-navigation/core@7.22.1/packages/core/package.json), [upstream decoder advisory](https://github.com/advisories/GHSA-qr28-fpjm-wq7f), [Undici fixes](https://github.com/nodejs/undici/releases/tag/v6.29.1).

## Audit result and unresolved records

| Severity | Before | After |
| -------- | -----: | ----: |
| Critical |      0 |     0 |
| High     |      9 |     2 |
| Moderate |     19 |    18 |
| Low      |      1 |     1 |
| Total    |     29 |    21 |

This is not a clean-audit claim. The two remaining high library records are image-size 1.2.1 and PostCSS 8.4.49 in Node-based Metro/Expo build tooling. Their published patched versions exceed the current parents' ^1.0.2 and ~8.4.32 ranges. The mobile application source does not import these Node processors. Remaining moderate/low leaf advisories include glob, minimatch, uuid and deepmerge; several Expo package findings propagate from those dependencies. npm's production-dependency classification includes Expo's build tools and is not a mobile-bundle reachability report. [Image parser advisory](https://github.com/advisories/GHSA-5p2g-fcmc-qvqq), [PostCSS advisory](https://github.com/advisories/GHSA-fxqj-rqcc-2cmp).

A broad no-force audit-fix candidate was discarded because it introduced unrelated dependency trees, including newer Expo/native tooling. No parent-range-breaking overrides or SDK major migration were applied. Build these sources with trusted repository assets; resolve the remaining tooling advisories in a separately validated toolchain/SDK migration before claiming zero findings.

## Verification

The initial isolated public-source candidate passed npm ci --ignore-scripts --no-audit without force or peer overrides, preserved its lockfile hash, passed 487 tests, and exported both Hermes bundles. The current source passes **496 tests** and both platform exports. Fresh CNG with direct Worklets **0.5.1** also passed normal-signed simulator Release compilation and strict codesign verification. The separate Store **1.0.0 (2)** IPA passed signature/profile inspection and Apple processing. These checks do not establish real paid/Pro behavior or a public-release signoff; see the release and subscription-validation records for native QA boundaries.

## Exact Store-source recheck

The first cloud Doctor run found the missing direct Worklets peer. Source `da7339f` declares **react-native-worklets 0.5.1**, matching the installed Expo 54 mapping, instead of relying on the previously auto-resolved **0.6.1** peer. It is the only package-version change in this later lock update; no package paths were added or removed, and Reanimated remains **4.1.5**.

The [exact Store-source lockfile](https://raw.githubusercontent.com/feridunalacam/syncapp/da7339f3b9b072e9f2859974170b4350c8a3c549/package-lock.json) and manifest were fetched without authentication into a fresh isolated directory and their hashes matched the checkout. The public-source-only audit was repeated without private workspace inventory, inherited credentials, install scripts or fixes. It still reports **21 findings: 2 high, 18 moderate, 1 low and no critical findings**. Vulnerable package membership and direct advisory records are unchanged; no Worklets finding was added. Six `effects`/`fixAvailable` metadata fields differ across five npm records, so the complete audit JSON is not claimed to be identical. Some suggested fixes now select Expo 58; no SDK migration was applied.

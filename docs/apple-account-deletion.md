# Apple account deletion — live activation and verification boundaries

## Current live activation

On 13 November, Root verified the owner's exact signing-key/backend approval and completed live activation. The downloaded key is scoped only to Sign in with Apple for the exact Sync App ID; EC P-256 format and private local directory `0700` / file `0600` permissions passed. **Five server secrets** were saved, with all five 64-character SHA256 digests matching after UI reload; no private values are included here.

Hosted migration **20261113091118**, SHA256 `c200caaaad3606fa1c8ee2990c6f6bdf367762371cc2f8882c4af599162276b9`, is applied. Private-table RLS/all-role privileges, exact RPC signatures/service-only EXECUTE and Auth-user FK cascade checks pass; the activation snapshot has **zero token rows**. **delete-account v11 was deployed first; register-apple-token v1 last**, with all 12 deployed source files read back exactly. Missing-auth POST401, GET405 and OPTIONS204 checks across both routes pass **6/6**. These checks do not exercise authenticated Apple registration or revocation. [Activation receipt](../artifacts/app-store/apple-revocation-activation-preflight-2026-11-13/live-activation-safe.json), [HTTP smoke](../artifacts/app-store/apple-revocation-activation-preflight-2026-11-13/live-http-smoke-safe.json).

Existing billing code digests remain unchanged, but five secret saves advanced their deployed revisions: sync-subscription **11**, production webhook **11**, review webhook **6**. Do not treat revision numbers as unchanged. Advisors show only five expected private-RLS/no-policy INFO entries and the existing leaked-password-protection WARN, with no new unexpected findings. No owner/review account was deleted and no real Apple code/token was sent. **Fresh native Apple token registration and actual Apple revocation remain unproven**, pending phone QA; ordinary sign-in/deletion and manual fallback source behavior are distinct from this missing positive evidence.

The later source commit `bdc7d22bbbc7754f6990b60c0f982fb30af8fcd2` aligns the migration filename and one test reference without changing SQL; actual PG 1/1 and unchanged 157 runtime/16 native-input checks pass. Signed production9 is now Apple VALID/IN_BETA_TESTING in the existing owner-only group (1 tester/6 builds), with strict artifact verification and eight preservation checks. This distribution result does not prove real Apple token registration or revocation. Separate local native spot-checks passed; full walkthrough/physical QA remains open. [Exact signed9 receipt](ios-build-1.0.0-9-evidence.json). The original implementation task itself made no live changes; this separately approved activation supersedes its old pending status.

## Source data flow and access — positive live Apple path still unverified

1. Native Apple authentication still verifies nonce/state and signs into Supabase
   using the identity token. The transient Apple `authorizationCode` is then sent
   to **POST `/functions/v1/register-apple-token`**, with the verified new Supabase
   session's explicit bearer token. Codes are not put in AsyncStorage, backups,
   session metadata, diagnostic output or the registration response.
2. The handler independently calls Supabase `getUser` and verifies recent signed
   claims. It accepts only an authorization code; caller-supplied user IDs,
   subjects or client IDs do not select ownership. The authoritative Apple subject
   comes from `user.identities[].identity_data.sub`, never user-editable metadata.
3. The server exchanges the single-use code at Apple's fixed `/auth/token` URL,
   verifies the returned identity token's Apple RSA signature, issuer, audience,
   subject and lifetime, and encrypts the refresh token using AES-256-GCM. The
   authenticated additional data binds the ciphertext to its Supabase UUID,
   Apple subject and native client ID. Each write gets a fresh random 96-bit IV.
4. Only ciphertext and its binding metadata are stored in
   `private.apple_revocation_tokens`. RLS is enabled, client access is revoked,
   and public RPCs have PUBLIC/anon/authenticated EXECUTE explicitly revoked;
   only `service_role` can call them. The write RPC rechecks the live Auth Apple
   identity, and the UUID foreign key cascades on account deletion.
5. `delete-account` attempts the fixed Apple `/auth/revoke` endpoint before its
   existing Supabase global-session revocation and hard deletion. No provider
   tokens are returned to the device. Legacy accounts, absent configuration,
   unreadable tokens or an Apple outage do not block deletion. Instead, a
   successful deletion includes `apple_revocation.status = manual_required`
   with explicit manual Apple-revocation instructions. The UI shows those steps
   and a fixed [Apple support link](https://support.apple.com/102571).
6. Native Apple revocation notifications and foreground/session restoration check
   the current Apple credential. An OS-confirmed revoked/not-found result signs
   out only that exact live Supabase session/Apple subject. Account changes,
   provider unlinking, unmounts and stale queued results are fenced. OS failures
   are not treated as revocation.

## Server-only configuration — now saved and verified

| Variable                     | Purpose                                                                                   |
| ---------------------------- | ----------------------------------------------------------------------------------------- |
| `APPLE_AUTH_CLIENT_ID`       | Exactly `com.feridun.syncapp` for this native iOS path.                                   |
| `APPLE_AUTH_TEAM_ID`         | Apple team identifier used as the server client-secret issuer.                            |
| `APPLE_AUTH_KEY_ID`          | Identifier of the Apple Sign in with Apple signing key.                                   |
| `APPLE_AUTH_PRIVATE_KEY`     | The Apple `.p8` PKCS#8 private signing key, server secret only.                           |
| `APPLE_TOKEN_ENCRYPTION_KEY` | Separate cryptographically random 32-byte AES key, base64url encoded; server secret only. |

None belong in `EXPO_PUBLIC_*`, EAS client configuration, public tables, app
bundles, Git, logs or chat. Missing or invalid configuration returns a sanitized
registration failure and manual deletion fallback. Registration failures never
undo an already verified Apple sign-in. Rotating the encryption key without a
planned server-side re-encryption makes old ciphertext unreadable; deletion still
works with the explicit manual fallback.

Those activation prerequisites are now completed under the owner's specific
approval, published policy and the verified migration/function boundaries above.
This does not replace positive native Apple registration/revocation testing.
This is a server retention addition: encrypted Apple refresh tokens are kept only
for validating/revoking the user's Apple authorization and removed with the Sync
account. There is no automatic expiry cleanup: a later registration replaces the
credential, while sign-out or OS permission revocation alone does not erase it.
No new advertising or music data flow is introduced. The existing review
account UUID retention/reservation and billing environment separation are unchanged.

## Verification scope — positive live Apple path still open

Tests use synthetic credentials, generated in-memory signing keys, offline Apple
responses and ephemeral PostgreSQL. They exercise the actual handlers and
migration, WebCrypto signatures/authenticated encryption, stale-account/native
notification fences and manual-deletion UI. They neither delete the owner's Apple
account nor establish live Apple revocation. The live negative HTTP/security
checks above are now additional evidence; the positive Apple path remains open.

Primary references: [Apple TN3194](https://developer.apple.com/documentation/technotes/tn3194-handling-account-deletions-and-revoking-tokens-for-sign-in-with-apple),
[Apple token revocation](https://developer.apple.com/documentation/signinwithapplerestapi/revoke-tokens),
[App Review account deletion](https://developer.apple.com/help/app-review/guideline-reference/5-1-1-account-deletion).

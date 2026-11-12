# Apple account deletion — local implementation, activation pending

This change is not live-deployed or enabled by the source alone. No Apple signing
key, database change, hosted function deployment, existing-account deletion, or
provider change was performed in this implementation task. Ordinary Apple login
and Sync account deletion continue when this optional registration is unavailable.

## Data flow and access

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

## Server-only configuration required before live activation

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

Before enabling this live, obtain the owner's specific approval for signing-key
creation/use and the new private-token data processing, update the public privacy
policy, review the migration/security advisors and deploy the migration/functions.
This is a server retention addition: encrypted Apple refresh tokens are kept only
for validating/revoking the user's Apple authorization and removed with the Sync
account. No new advertising or music data flow is introduced. The existing review
account UUID retention/reservation and billing environment separation are unchanged.

## Verification scope

Tests use synthetic credentials, generated in-memory signing keys, offline Apple
responses and ephemeral PostgreSQL. They exercise the actual handlers and
migration, WebCrypto signatures/authenticated encryption, stale-account/native
notification fences and manual-deletion UI. They neither delete the owner's Apple
account nor establish live Apple revocation until a separately authorized test.

Primary references: [Apple TN3194](https://developer.apple.com/documentation/technotes/tn3194-handling-account-deletions-and-revoking-tokens-for-sign-in-with-apple),
[Apple token revocation](https://developer.apple.com/documentation/signinwithapplerestapi/revoke-tokens),
[App Review account deletion](https://developer.apple.com/help/app-review/guideline-reference/5-1-1-account-deletion).

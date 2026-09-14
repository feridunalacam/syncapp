/**
 * Spotify access-token expiry helpers.
 *
 * Spotify access tokens are short-lived (~1h). We refresh slightly before the
 * server-reported expiry to avoid using a token mid-request. All call sites
 * that store an `expiresAt` timestamp should derive it from this helper so we
 * don't drift between modules.
 */

export const ACCESS_TOKEN_EXPIRY_BUFFER_SECONDS = 60;
export const DEFAULT_ACCESS_TOKEN_TTL_SECONDS = 3600;

/**
 * Convert an OAuth `expires_in` (seconds-from-now) value into a UTC millis
 * timestamp at which we should consider the token effectively expired.
 *
 * - Falls back to a 1h TTL when the input is missing/invalid.
 * - Subtracts a buffer so we refresh before the real expiry hits.
 * - A token shorter than the safety buffer is immediately due for refresh.
 */
export const computeAccessTokenExpiresAt = (expiresInSeconds, now = Date.now()) => {
  const ttl =
    typeof expiresInSeconds === 'number' &&
    Number.isFinite(expiresInSeconds) &&
    expiresInSeconds > 0
      ? expiresInSeconds
      : DEFAULT_ACCESS_TOKEN_TTL_SECONDS;
  const safeTtl = Math.max(ttl - ACCESS_TOKEN_EXPIRY_BUFFER_SECONDS, 0);
  return now + safeTtl * 1000;
};

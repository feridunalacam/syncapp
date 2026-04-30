import { useCallback } from 'react';

/**
 * Helpers that figure out *which* music platform a given source
 * (track / playlist / countdown sound) belongs to and whether that
 * platform is actually usable right now.
 *
 * Pulled out of `useAudioController` so the orchestration code reads
 * top-down without being interrupted by string-matching trivia.
 */
export const usePlatformDetection = ({ connectedPlatforms }) => {
  /**
   * Best-guess the platform for a given music source. Order of precedence:
   *   1. Explicit `source.platform`
   *   2. Routine-level fallback `routine.platform`
   *   3. URI scheme sniffing (`spotify:` / `file:` / `device:` …)
   *   4. null — caller decides whether to fall back further.
   */
  const detectPlatformFromSource = useCallback((source, routine) => {
    if (source?.platform) return source.platform;
    if (routine?.platform) return routine.platform;

    if (source?.uri) {
      if (source.uri.startsWith('spotify:')) return 'spotify';
      if (source.uri.startsWith('file:') || source.uri.startsWith('device:')) return 'device';
    }

    return null;
  }, []);

  /**
   * Whether we can actually play media on a given platform right now.
   * "device" and "voices" are local / built-in so they're always ready.
   * Remote platforms must have an active connection AND a non-expired
   * access token already in context.
   */
  const isPlatformReady = useCallback(
    (platformId) => {
      if (!platformId || platformId === 'device' || platformId === 'voices') return true;
      const platformData = connectedPlatforms?.[platformId];
      return Boolean(platformData?.connected && platformData?.accessToken);
    },
    [connectedPlatforms],
  );

  return { detectPlatformFromSource, isPlatformReady };
};

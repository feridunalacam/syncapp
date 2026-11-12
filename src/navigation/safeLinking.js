// Keep navigation input small and reject malformed UTF-8/percent escapes before
// query-string's legacy tolerant decoder can enter its expensive fallback.
// This is validation only: valid paths reach React Navigation unchanged.
export const MAX_NAVIGATION_PATH_LENGTH = 4096;

export function createSafeStateFromPath(parseState) {
  return (path, options) => {
    if (typeof path !== 'string' || path.length > MAX_NAVIGATION_PATH_LENGTH) return undefined;
    try {
      decodeURIComponent(path);
    } catch {
      return undefined;
    }
    return parseState(path, options);
  };
}

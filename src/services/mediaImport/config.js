// Generic web extraction and URL downloading stay in explicit owner development.
// Files imports and previously saved media are independent of this gate.
export function webMediaImportAvailable({ dev = false, profile, enabled } = {}) {
  return dev === true && profile === 'development' && enabled === 'true';
}

export const WEB_MEDIA_IMPORT_AVAILABLE = webMediaImportAvailable({
  dev: typeof __DEV__ !== 'undefined' && __DEV__,
  profile: process.env.EXPO_PUBLIC_BUILD_PROFILE,
  enabled: process.env.EXPO_PUBLIC_WEB_MEDIA_IMPORT_ENABLED,
});

export const WEB_MEDIA_IMPORT_UNAVAILABLE_MESSAGE =
  'Choose from Files to add audio. Check the sound’s license before importing.';

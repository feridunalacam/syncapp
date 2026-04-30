import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Single source of truth for AsyncStorage keys used by the app.
 *
 * Add new keys here so that:
 *   - we never typo a key at a call site,
 *   - it is trivial to audit what we persist,
 *   - migrations / wipes can be done from one place.
 */
// IMPORTANT: These string values must match the historic AsyncStorage keys
// previously written by the app. Changing them would orphan existing user data.
export const STORAGE_KEYS = Object.freeze({
  THEME_MODE: '@syncapp_theme_preference',

  ROUTINES: 'routines',
  COMPLETED_ROUTINES: 'completedRoutines',
  // Legacy one-time reset flag. Kept so existing installs don't reset twice.
  ROUTINES_RESET_FLAG: 'routines-reset-deneme-v1',

  CONNECTED_PLATFORMS: 'connectedPlatforms',
  SELECTED_PLATFORM: 'selectedPlatform',

  PROFILE_PICTURE_URI: 'profilePictureUri',
  PROFILE_BIO: 'profileBio',
  PROFILE_SOCIAL_LINKS: 'profileSocialLinks',

  POSTS: 'posts',

  USER_TOKEN: 'userToken',
});

const warn = (action, key, error) => {
  if (__DEV__) {
    console.warn(`[storage] ${action} failed for key "${key}":`, error);
  }
};

/**
 * Read a raw string value. Returns `null` if the key is missing or the
 * underlying read throws (we treat storage errors as "not present" so callers
 * don't need a try/catch around every getter).
 */
export const getString = async (key) => {
  try {
    return await AsyncStorage.getItem(key);
  } catch (error) {
    warn('getString', key, error);
    return null;
  }
};

/**
 * Persist a raw string value. Returns `true` on success, `false` on failure.
 * `null`/`undefined` clears the key.
 */
export const setString = async (key, value) => {
  try {
    if (value == null) {
      await AsyncStorage.removeItem(key);
    } else {
      await AsyncStorage.setItem(key, String(value));
    }
    return true;
  } catch (error) {
    warn('setString', key, error);
    return false;
  }
};

/**
 * Read and JSON.parse a value. Returns `defaultValue` if the key is missing,
 * the read throws, or the stored value is malformed JSON. We deliberately do
 * not throw — most call sites just want a usable fallback.
 */
export const getJSON = async (key, defaultValue = null) => {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (raw == null) return defaultValue;
    return JSON.parse(raw);
  } catch (error) {
    warn('getJSON', key, error);
    return defaultValue;
  }
};

/**
 * JSON.stringify and persist a value. `null`/`undefined` clears the key.
 * Returns `true` on success, `false` on failure.
 */
export const setJSON = async (key, value) => {
  try {
    if (value == null) {
      await AsyncStorage.removeItem(key);
    } else {
      await AsyncStorage.setItem(key, JSON.stringify(value));
    }
    return true;
  } catch (error) {
    warn('setJSON', key, error);
    return false;
  }
};

/**
 * Remove a single key. Always resolves; never rejects.
 */
export const remove = async (key) => {
  try {
    await AsyncStorage.removeItem(key);
    return true;
  } catch (error) {
    warn('remove', key, error);
    return false;
  }
};

/**
 * Remove multiple keys. Always resolves.
 */
export const removeMany = async (keys) => {
  try {
    await AsyncStorage.multiRemove(keys);
    return true;
  } catch (error) {
    warn('removeMany', keys.join(','), error);
    return false;
  }
};

const storage = {
  KEYS: STORAGE_KEYS,
  getString,
  setString,
  getJSON,
  setJSON,
  remove,
  removeMany,
};

export default storage;

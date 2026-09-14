import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import storage, { STORAGE_KEYS } from './storage';

const SECURE_KEY = 'syncapp.music.credentials';
let writeQueue = Promise.resolve();
let webCredentials = {};

const splitPlatforms = (platforms) => {
  const metadata = {};
  const credentials = {};
  Object.entries(platforms || {}).forEach(([id, value]) => {
    const { accessToken, refreshToken, ...info } = value;
    metadata[id] = info;
    if (id !== 'device') credentials[id] = { accessToken, refreshToken };
  });
  return { metadata, credentials };
};

// Serialize saves so an older token refresh cannot overwrite a disconnect.
export const savePlatforms = (platforms) => {
  const { metadata, credentials } = splitPlatforms(platforms);
  const save = async () => {
    if (Platform.OS === 'web') webCredentials = credentials;
    else await SecureStore.setItemAsync(SECURE_KEY, JSON.stringify(credentials));
    // Remove legacy plaintext only after the secure write has succeeded.
    if (!(await storage.setJSON(STORAGE_KEYS.CONNECTED_PLATFORMS, metadata))) {
      throw new Error('Could not save music connection settings.');
    }
  };
  const result = writeQueue.then(save);
  writeQueue = result.catch(() => {});
  return result;
};

export const loadPlatforms = async () => {
  const metadata = await storage.getJSON(STORAGE_KEYS.CONNECTED_PLATFORMS, {});
  let credentials = webCredentials;
  if (Platform.OS !== 'web') {
    const stored = await SecureStore.getItemAsync(SECURE_KEY);
    credentials = stored ? JSON.parse(stored) : {};
  }
  const result = {};
  Object.entries(metadata || {}).forEach(([id, info]) => {
    result[id] = { ...info, ...credentials[id] };
    if (id !== 'device' && !result[id].accessToken && !result[id].refreshToken)
      result[id].connected = false;
  });
  result.device = { connected: true, accessToken: 'device' };
  if (
    Object.entries(metadata || {}).some(
      ([id, info]) => id !== 'device' && (info.accessToken || info.refreshToken),
    )
  ) {
    await savePlatforms(result);
  }
  return result;
};

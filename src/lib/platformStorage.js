import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import storage, { STORAGE_KEYS } from './storage';

const SECURE_KEY = 'syncapp.music.credentials';
const writeQueues = new Map();
const closedAccounts = new Set();
let webCredentials = {};
const secureKeyFor = (accountId) => (accountId ? `${SECURE_KEY}.${accountId}` : SECURE_KEY);
const ensureAccountOpen = (accountId) => {
  if (accountId && closedAccounts.has(accountId))
    throw new Error('This account has been deleted from this device.');
};
const enqueue = (secureKey, operation) => {
  const result = (writeQueues.get(secureKey) || Promise.resolve()).then(operation);
  writeQueues.set(
    secureKey,
    result.catch(() => {}),
  );
  return result;
};

// Invalidation happens before the first await, including refreshes that have
// not reached savePlatforms yet. Account IDs are never reopened in this process.
export const invalidateAccountPlatforms = (accountId) => {
  if (!accountId) throw new Error('An account is required.');
  closedAccounts.add(accountId);
};

export const clearAccountPlatforms = async (accountId) => {
  invalidateAccountPlatforms(accountId);
  const secureKey = secureKeyFor(accountId);
  await enqueue(secureKey, async () => {
    delete webCredentials[secureKey];
    if (Platform.OS !== 'web') await SecureStore.deleteItemAsync(secureKey);
  });
};

const splitPlatforms = (platforms) => {
  const metadata = {};
  const credentials = {};
  Object.entries(platforms || {}).forEach(([id, value]) => {
    const { accessToken, refreshToken, ...info } = value;
    metadata[id] = info;
    if (id !== 'device' && info.authentication !== 'native')
      credentials[id] = { accessToken, refreshToken };
  });
  return { metadata, credentials };
};

// Serialize saves so an older token refresh cannot overwrite a disconnect.
export const savePlatforms = (platforms, options = {}) => {
  const accountStorage = options.storage || storage;
  const secureKey = secureKeyFor(options.accountId);
  const { metadata, credentials } = splitPlatforms(platforms);
  const save = async () => {
    ensureAccountOpen(options.accountId);
    if (Platform.OS === 'web') webCredentials[secureKey] = credentials;
    else await SecureStore.setItemAsync(secureKey, JSON.stringify(credentials));
    // Remove legacy plaintext only after the secure write has succeeded.
    if (!(await accountStorage.setJSON(STORAGE_KEYS.CONNECTED_PLATFORMS, metadata))) {
      throw new Error('Could not save music connection settings.');
    }
  };
  return enqueue(secureKey, save);
};

export const loadPlatforms = async (options = {}) => {
  const accountStorage = options.storage || storage;
  const secureKey = secureKeyFor(options.accountId);
  ensureAccountOpen(options.accountId);
  const metadata = await accountStorage.getJSON(STORAGE_KEYS.CONNECTED_PLATFORMS, {});
  let credentials = webCredentials[secureKey] || {};
  if (Platform.OS !== 'web') {
    const stored = await SecureStore.getItemAsync(secureKey);
    credentials = stored ? JSON.parse(stored) : {};
  }
  ensureAccountOpen(options.accountId);
  const result = {};
  Object.entries(metadata || {}).forEach(([id, info]) => {
    result[id] = { ...info, ...credentials[id] };
    const nativeMusic = id === 'appleMusic' && info.authentication === 'native';
    if (id !== 'device' && !nativeMusic && !result[id].accessToken && !result[id].refreshToken)
      result[id].connected = false;
  });
  result.device = { connected: true, accessToken: 'device' };
  if (
    Object.entries(metadata || {}).some(
      ([id, info]) => id !== 'device' && (info.accessToken || info.refreshToken),
    )
  ) {
    await savePlatforms(result, options);
  }
  return result;
};

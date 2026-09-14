import Constants, { ExecutionEnvironment } from 'expo-constants';

// Public OAuth client identifier, not a client secret. Must belong to the app owner.
export const SPOTIFY_CLIENT_ID =
  process.env.EXPO_PUBLIC_SPOTIFY_CLIENT_ID || '7a788647b3ac47e59ddfc623a26bb74b';
export const SPOTIFY_REDIRECT_URI = 'syncapp://spotify-callback';
export const IS_EXPO_GO = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
export const SPOTIFY_SCOPES = [
  'playlist-read-private',
  'playlist-read-collaborative',
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
  'user-read-private',
].join(' ');

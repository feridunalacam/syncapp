import * as AuthSession from 'expo-auth-session';
import Constants from 'expo-constants';

// Spotify API Configuration
export const SPOTIFY_CLIENT_ID = '7a788647b3ac47e59ddfc623a26bb74b';

// Use proxy for Expo Go (development) or custom scheme for standalone builds
// This ensures it works in both development and production
const isStandalone = Constants.executionEnvironment === 'standalone';
export const SPOTIFY_REDIRECT_URI = AuthSession.makeRedirectUri({
  useProxy: !isStandalone, // Use proxy in Expo Go, custom scheme in standalone
  scheme: 'syncapp',
  path: 'spotify-callback',
});

// To debug Spotify redirect URI mismatch errors, log SPOTIFY_REDIRECT_URI from
// a screen during development and add the printed value to the Spotify dashboard
// (https://developer.spotify.com/dashboard) under "Redirect URIs".

export const SPOTIFY_SCOPES = [
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
  'streaming',
  'user-read-email',
  'user-read-private',
].join(' ');


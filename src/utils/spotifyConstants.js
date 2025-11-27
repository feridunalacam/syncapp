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

// Log redirect URI for setup (check console to add to Spotify dashboard)
console.log('═══════════════════════════════════════════════════════');
console.log('🔴 IMPORTANT: Spotify Redirect URI Configuration');
console.log('═══════════════════════════════════════════════════════');
console.log('Your Spotify Redirect URI is:', SPOTIFY_REDIRECT_URI);
console.log('');
console.log('📝 Steps to fix "INVALID_CLIENT: Invalid redirect URI" error:');
console.log('1. Go to https://developer.spotify.com/dashboard');
console.log('2. Click on your app (Client ID: ' + SPOTIFY_CLIENT_ID + ')');
console.log('3. Click "Edit Settings"');
console.log('4. In "Redirect URIs", add this EXACT URI:');
console.log('   ' + SPOTIFY_REDIRECT_URI);
console.log('5. Click "Add" and then "Save"');
console.log('6. Wait a few seconds for changes to propagate');
console.log('7. Try connecting again in the app');
console.log('═══════════════════════════════════════════════════════');

export const SPOTIFY_SCOPES = [
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
  'streaming',
  'user-read-email',
  'user-read-private',
].join(' ');


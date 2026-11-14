import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { Alert } from 'react-native';
import * as AuthSession from 'expo-auth-session';
import { usePlatformContext } from './PlatformContext';
import {
  IS_EXPO_GO,
  SPOTIFY_CLIENT_ID,
  SPOTIFY_REDIRECT_URI,
  SPOTIFY_SCOPES,
  SPOTIFY_AVAILABLE,
} from '../services/spotify/config';
import { SPOTIFY_UNAVAILABLE_MESSAGE } from '../services/spotify/availability';
import { computeAccessTokenExpiresAt } from '../services/spotify/auth';

const Context = createContext(null);
const discovery = {
  authorizationEndpoint: 'https://accounts.spotify.com/authorize',
  tokenEndpoint: 'https://accounts.spotify.com/api/token',
};
export function SpotifyConnectionProvider({ children }) {
  const { connectPlatform, disconnectPlatform, connectedPlatforms, ready, connectionError } =
    usePlatformContext();
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState(null);
  const pending = useRef(false);
  const connect = useCallback(async () => {
    if (pending.current || !ready) return;
    setError(null);
    if (!SPOTIFY_AVAILABLE) {
      setError(SPOTIFY_UNAVAILABLE_MESSAGE);
      return;
    }
    if (IS_EXPO_GO) {
      setError('Open the SyncApp development build to connect Spotify.');
      Alert.alert(
        'Open SyncApp to connect',
        'Spotify sign-in needs the installed SyncApp development build. Expo Go cannot return to this app after sign-in.',
      );
      return;
    }
    pending.current = true;
    setConnecting(true);
    let stage = 'sign-in';
    try {
      // A fresh verifier and state for every attempt; AuthSession validates the returned state.
      const request = new AuthSession.AuthRequest({
        clientId: SPOTIFY_CLIENT_ID,
        scopes: SPOTIFY_SCOPES.split(' '),
        usePKCE: true,
        redirectUri: SPOTIFY_REDIRECT_URI,
        responseType: AuthSession.ResponseType.Code,
      });
      const result = await request.promptAsync(discovery);
      if (result.type === 'cancel' || result.type === 'dismiss') return;
      if (result.type === 'error') throw result.error || new Error('Authorization failed');
      if (result.type !== 'success' || !result.params?.code || !request.codeVerifier)
        throw new Error('Spotify sign-in was not completed. Please try again.');
      stage = 'token exchange';
      const token = await AuthSession.exchangeCodeAsync(
        {
          clientId: SPOTIFY_CLIENT_ID,
          code: result.params.code,
          redirectUri: SPOTIFY_REDIRECT_URI,
          extraParams: { code_verifier: request.codeVerifier },
        },
        discovery,
      );
      if (!token.accessToken || !token.refreshToken)
        throw new Error('Spotify did not provide a persistent connection. Please reconnect.');
      stage = 'saving connection';
      await connectPlatform('spotify', {
        accessToken: token.accessToken,
        refreshToken: token.refreshToken,
        expiresAt: computeAccessTokenExpiresAt(token.expiresIn),
        scopes: token.scope || SPOTIFY_SCOPES,
      });
    } catch (failure) {
      // Never expose provider descriptions, callback URLs, authorization codes or tokens.
      const knownCodes = [
        'invalid_request',
        'invalid_client',
        'invalid_grant',
        'unauthorized_client',
        'unsupported_grant_type',
        'invalid_scope',
        'access_denied',
        'ERR_REQUEST_CANCELED',
        'ERR_WEB_BROWSER',
        'ERR_CRYPTO_DIGEST',
        'ERR_AUTH_SESSION',
        'ERR_KEY_CHAIN',
      ];
      const code = knownCodes.includes(failure?.code) ? failure.code : null;
      const messages = {
        'sign-in': 'Spotify sign-in could not finish. Please try connecting again.',
        'token exchange':
          'Spotify sign-in returned, but the connection could not be activated. Please reconnect.',
        'saving connection':
          'Spotify authorized the connection, but SyncApp could not save it on this device. Please try again.',
      };
      const missingEntitlement =
        stage === 'saving connection' && /entitlement/i.test(failure?.message || '');
      const message = missingEntitlement
        ? 'Spotify authorized the connection, but this SyncApp build is missing permission to use the iOS Keychain. The app build needs to be repaired.'
        : messages[stage] + (code ? ` (${code})` : '');
      console.warn('[Spotify connection]', stage, code || 'unclassified');
      setError(message);
      Alert.alert('Spotify connection failed', message);
    } finally {
      pending.current = false;
      setConnecting(false);
    }
  }, [connectPlatform, ready]);
  const disconnect = useCallback(
    () =>
      Alert.alert('Disconnect Spotify?', 'Your routines and activity will stay on this device.', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: () => {
            setError(null);
            disconnectPlatform('spotify');
          },
        },
      ]),
    [disconnectPlatform],
  );
  return (
    <Context.Provider
      value={{
        available: SPOTIFY_AVAILABLE,
        connected: !!connectedPlatforms.spotify?.connected,
        connecting,
        error: error || connectionError,
        ready,
        connect,
        disconnect,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useSpotifyConnectionContext() {
  return useContext(Context);
}

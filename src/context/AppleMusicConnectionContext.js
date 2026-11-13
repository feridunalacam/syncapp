import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { usePlatformContext } from './PlatformContext';
import { useAds } from './AdsContext';
import appleMusicService, { appleMusicCompanionService } from '../services/appleMusic';
import { createAppleMusicCompanionController } from '../services/appleMusic/companion';
import { acquireMusicCueSilence, registerCueMusicSource } from '../services/alerts/player';

const noop = () => {};
const Context = createContext({
  available: false,
  companionAvailable: false,
  timedAvailable: false,
  connected: false,
  connecting: false,
  ready: false,
  player: { isActive: () => false, registerBeforePlay: () => noop },
});

export function AppleMusicConnectionProvider({ children }) {
  const platform = usePlatformContext();
  const ads = useAds();
  const { ready, connectPlatform, disconnectPlatform } = platform;
  const companionAvailable = appleMusicCompanionService.available;
  const timedAvailable = appleMusicService.available;
  const connection = platform.appleMusicConnection || platform.connectedPlatforms.appleMusic;
  const connected = !!connection?.connected;
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState(null);
  const [playerState, setPlayerState] = useState(null);
  const pending = useRef(false);
  const alive = useRef(true);
  const cueLease = useRef(null);
  const beforePlay = useRef(null);
  const latest = useRef(null);
  latest.current = { ads, ready, connected, connectPlatform, disconnectPlatform };
  const controller = useRef(null);
  if (!controller.current)
    controller.current = createAppleMusicCompanionController({
      service: appleMusicCompanionService,
      acquireBlocker: () => latest.current.ads.acquirePresentationBlocker(),
      waitForPresenters: () => latest.current.ads.waitForAdPresenters(),
      beforePlay: async () => {
        if (pending.current || !latest.current.connected)
          throw new Error('Connect Apple Music before starting playback.');
        const result = await beforePlay.current?.();
        if (result === false || result?.success === false)
          throw new Error(result?.error || 'The previous music could not be paused. Try again.');
      },
      onChange: (state) => {
        if (state.reserved || state.ownsQueue || (alive.current && state.previousOwnerPending)) {
          if (!cueLease.current) cueLease.current = acquireMusicCueSilence();
        } else {
          cueLease.current?.();
          cueLease.current = null;
        }
        if (alive.current) setPlayerState(state);
      },
    });
  useEffect(() => {
    alive.current = true;
    controller.current.setAppActive(AppState.currentState === 'active');
    const listener = AppState.addEventListener('change', (state) => {
      controller.current.setAppActive(state === 'active');
    });
    return () => {
      alive.current = false;
      listener.remove();
      beforePlay.current = null;
      controller.current.dispose().catch(() => {});
    };
  }, []);
  useEffect(
    () =>
      companionAvailable
        ? registerCueMusicSource({
            suspendForCue: (options) => controller.current.suspendForCue(options),
          })
        : undefined,
    [companionAvailable],
  );
  const connect = useCallback(async () => {
    if (!latest.current.ready || pending.current || !(companionAvailable || timedAvailable))
      return { success: false, error: 'Apple Music is not ready yet.' };
    pending.current = true;
    setConnecting(true);
    setError(null);
    try {
      const result = companionAvailable
        ? await controller.current.runPermission(() => appleMusicCompanionService.authorize())
        : await appleMusicService.authorize();
      if (result?.cancelled || !alive.current) return result;
      if (result === false || result?.success === false)
        throw new Error(result?.error || 'Apple Music could not connect. Please try again.');
      await latest.current.connectPlatform('appleMusic', result);
      return result;
    } catch (failure) {
      const message = failure.userMessage || failure.message || 'Apple Music could not connect.';
      if (alive.current) setError(message);
      return { success: false, error: message };
    } finally {
      pending.current = false;
      if (alive.current) setConnecting(false);
    }
  }, [companionAvailable, timedAvailable]);
  const disconnect = useCallback(async () => {
    if (pending.current || !(companionAvailable || timedAvailable))
      return { success: false, error: 'Please wait for the current connection change.' };
    pending.current = true;
    setConnecting(true);
    setError(null);
    try {
      const stopped = await controller.current.clear();
      if (stopped?.success === false) throw new Error(stopped.error);
      if (timedAvailable) {
        await beforePlay.current?.();
        await appleMusicService.cleanup();
      }
      if (alive.current) await latest.current.disconnectPlatform('appleMusic');
      return { success: true };
    } catch (failure) {
      const message = failure.userMessage || failure.message || 'Apple Music could not disconnect.';
      if (alive.current) setError(message);
      return { success: false, error: message };
    } finally {
      pending.current = false;
      if (alive.current) setConnecting(false);
    }
  }, [companionAvailable, timedAvailable]);
  const catalog = useCallback(
    async (operation) => {
      if (!companionAvailable || !latest.current.ready || !latest.current.connected)
        throw new Error('Connect Apple Music to browse songs and playlists.');
      const release = latest.current.ads.acquirePresentationBlocker();
      try {
        await latest.current.ads.waitForAdPresenters();
        if (!alive.current || !latest.current.connected)
          throw new Error('Music request cancelled.');
        const token = await appleMusicCompanionService.getAccessToken();
        if (!alive.current || !latest.current.connected)
          throw new Error('Music request cancelled.');
        const result = await operation(token.accessToken);
        if (!alive.current || !latest.current.connected)
          throw new Error('Music request cancelled.');
        return result;
      } finally {
        release();
      }
    },
    [companionAvailable],
  );
  const search = useCallback(
    (query, types = ['track', 'playlist'], limit = 30) =>
      catalog((token) => appleMusicCompanionService.search(token, query, types, limit)),
    [catalog],
  );
  const getPlaylists = useCallback(
    () => catalog(() => appleMusicCompanionService.getUserPlaylists()),
    [catalog],
  );
  const getPlaylistTracks = useCallback(
    (id) => catalog((token) => appleMusicCompanionService.getPlaylistTracks(token, id)),
    [catalog],
  );
  const state = playerState || controller.current.getState();
  const player = {
    ...state,
    open: () => companionAvailable && controller.current.setVisible(true),
    close: () => controller.current.setVisible(false),
    playTrack: (track) => controller.current.playTrack(track),
    playPlaylist: (playlist, shuffle) => controller.current.playPlaylist(playlist, shuffle),
    pause: () => controller.current.pause(),
    resume: () => controller.current.resume(),
    next: () => controller.current.next(),
    previous: () => controller.current.previous(),
    setShuffle: (value) => controller.current.setShuffle(value),
    setRepeat: (value) => controller.current.setRepeat(value),
    clear: () => controller.current.clear(),
    cancelCueResume: () => controller.current.cancelCueResume(),
    isActive: () => controller.current.isActive(),
    registerBeforePlay(callback) {
      beforePlay.current = callback;
      return () => {
        if (beforePlay.current === callback) beforePlay.current = null;
      };
    },
  };
  return (
    <Context.Provider
      value={{
        available: companionAvailable || timedAvailable,
        companionAvailable,
        timedAvailable,
        ready,
        connected: (companionAvailable || timedAvailable) && connected,
        connecting,
        error:
          error ||
          state.error ||
          ((companionAvailable || timedAvailable) && platform.connectionError) ||
          null,
        connect,
        disconnect,
        player,
        search,
        getPlaylists,
        getPlaylistTracks,
      }}
    >
      {children}
    </Context.Provider>
  );
}

export const useAppleMusicConnection = () => useContext(Context);

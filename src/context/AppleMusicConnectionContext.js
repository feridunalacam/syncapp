import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { usePlatformContext } from './PlatformContext';
import { useAds } from './AdsContext';
import appleMusicService, { appleMusicCompanionService } from '../services/appleMusic';
import { createAppleMusicCompanionController } from '../services/appleMusic/companion';
import { acquireMusicCueSilence, registerCueMusicSource } from '../services/alerts/player';
import { normalizeRoutineSoundtrack, soundtrackPlaybackItem } from '../domain/routineSoundtrack';

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
  const [soundtrackPicker, setSoundtrackPicker] = useState(null);
  const selector = useRef(null);
  const selectorSequence = useRef(0);
  const pending = useRef(false);
  const catalogRevision = useRef(0);
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
    controller.current.setAppState(AppState.currentState);
    const listener = AppState.addEventListener('change', (state) => {
      controller.current.setAppState(state);
    });
    return () => {
      alive.current = false;
      listener.remove();
      beforePlay.current = null;
      selector.current = null;
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
  const cancelSoundtrackPicker = useCallback((id) => {
    if (id != null && selector.current?.id !== id) return;
    selector.current = null;
    if (alive.current) setSoundtrackPicker(null);
    controller.current.setVisible(false);
  }, []);
  const openSoundtrackPicker = useCallback(
    ({ routineName, selection, onSelect } = {}) => {
      if (
        !alive.current ||
        !companionAvailable ||
        !latest.current.ready ||
        typeof onSelect !== 'function'
      )
        return noop;
      const id = ++selectorSequence.current;
      selector.current = { id, onSelect };
      setSoundtrackPicker({
        id,
        routineName: typeof routineName === 'string' ? routineName.trim().slice(0, 60) : '',
        selection: normalizeRoutineSoundtrack(selection),
        initialTab: 'library',
      });
      controller.current.setVisible(true);
      return () => cancelSoundtrackPicker(id);
    },
    [companionAvailable, cancelSoundtrackPicker],
  );
  const selectSoundtrackItem = useCallback((id, item, shuffle) => {
    const request = selector.current;
    if (
      !alive.current ||
      !request ||
      request.id !== id ||
      !latest.current.connected ||
      pending.current
    )
      return { success: false, error: 'This routine music selection is no longer active.' };
    const selection = normalizeRoutineSoundtrack({
      ...item,
      kind: item?.kind || item?.type,
      shuffle,
    });
    if (!selection) return { success: false, error: 'Choose an Apple Music song or playlist.' };
    // Retire before calling the editor: repeated/stale presses cannot select twice.
    selector.current = null;
    setSoundtrackPicker(null);
    controller.current.setVisible(false);
    try {
      request.onSelect(selection, selection.shuffle);
      return { success: true };
    } catch {
      return { success: false, error: 'The routine music could not be selected. Try again.' };
    }
  }, []);
  const connect = useCallback(async () => {
    if (!latest.current.ready || pending.current || !(companionAvailable || timedAvailable))
      return { success: false, error: 'Apple Music is not ready yet.' };
    pending.current = true;
    catalogRevision.current++;
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
    catalogRevision.current++;
    if (selector.current) cancelSoundtrackPicker(selector.current.id);
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
  }, [companionAvailable, timedAvailable, cancelSoundtrackPicker]);
  const catalog = useCallback(
    async (operation, { timeoutMs } = {}) => {
      if (!companionAvailable || !latest.current.ready || !latest.current.connected)
        throw new Error('Connect Apple Music to browse songs and playlists.');
      const revision = catalogRevision.current;
      let retired = false;
      const cancelled = () =>
        retired ||
        !alive.current ||
        !latest.current.connected ||
        revision !== catalogRevision.current;
      const release = latest.current.ads.acquirePresentationBlocker();
      const read = async () => {
        await latest.current.ads.waitForAdPresenters();
        if (cancelled()) throw new Error('Music request cancelled.');
        const token = await appleMusicCompanionService.getAccessToken();
        if (cancelled()) throw new Error('Music request cancelled.');
        const result = await operation(token.accessToken);
        if (cancelled()) throw new Error('Music request cancelled.');
        return result;
      };
      let timer;
      try {
        if (!timeoutMs) return await read();
        const deadline = new Promise((_, reject) => {
          timer = setTimeout(() => {
            retired = true;
            reject(new Error('Music artwork request timed out.'));
          }, timeoutMs);
        });
        return await Promise.race([read(), deadline]);
      } finally {
        retired = true;
        if (timer !== undefined) clearTimeout(timer);
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
  const getPlaylistArtwork = useCallback(
    (ids) =>
      catalog((token) => appleMusicCompanionService.getPlaylistArtwork?.(token, ids) ?? [], {
        timeoutMs: 12000,
      }).catch(() => []),
    [catalog],
  );
  const state = playerState || controller.current.getState();
  const player = {
    ...state,
    open: () => {
      if (!companionAvailable) return;
      selector.current = null;
      setSoundtrackPicker(null);
      controller.current.setVisible(true);
    },
    close: () => cancelSoundtrackPicker(),
    playTrack: (track) => controller.current.playTrack(track),
    playPlaylist: (playlist, shuffle) => controller.current.playPlaylist(playlist, shuffle),
    playSoundtrack: (value) => {
      const selection = normalizeRoutineSoundtrack(value);
      const item = soundtrackPlaybackItem(selection);
      if (
        !item ||
        !alive.current ||
        !latest.current.ready ||
        !latest.current.connected ||
        pending.current
      )
        return Promise.resolve({
          success: false,
          error: 'Choose routine music and connect Apple Music before pressing Play.',
        });
      return selection.kind === 'playlist'
        ? controller.current.playPlaylist(item, selection.shuffle)
        : controller.current.playTrack(item);
    },
    beginStartAdBoundary: ({ isCurrent = () => true } = {}) => {
      if (
        !alive.current ||
        !latest.current.ready ||
        !latest.current.connected ||
        pending.current ||
        selector.current
      )
        return Promise.resolve(null);
      const revision = catalogRevision.current;
      return controller.current.beginStartAdBoundary({
        isCurrent: () =>
          alive.current &&
          latest.current.ready &&
          latest.current.connected &&
          !pending.current &&
          !selector.current &&
          revision === catalogRevision.current &&
          isCurrent(),
      });
    },
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
        getPlaylistArtwork,
        soundtrackPicker,
        openSoundtrackPicker,
        cancelSoundtrackPicker,
        selectSoundtrackItem,
      }}
    >
      {children}
    </Context.Provider>
  );
}

export const useAppleMusicConnection = () => useContext(Context);

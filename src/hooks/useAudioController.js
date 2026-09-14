import { useCallback, useEffect, useRef, useState } from 'react';
import { resolveRoundAudio } from '../domain/audio.js';

/** One serialized command stream prevents rapid phase changes racing audio loads. */
export const useAudioController = ({
  selectedPlatform,
  connectedPlatforms,
  refreshToken,
  getValidAccessToken,
  selectedRoutine,
  services,
  countdownSoundPlayer,
}) => {
  const [track, setTrack] = useState(null);
  const [isMusicPlaying, setIsMusicPlaying] = useState(false);
  const [musicProgress, setMusicProgress] = useState(0);
  const [isShuffled, setIsShuffled] = useState(false);
  const [isRepeating, setIsRepeating] = useState(false);
  const [audioError, setAudioError] = useState(null);
  const active = useRef(null);
  const pendingPhase = useRef(null);
  const wantsPaused = useRef(false);
  const queue = useRef(Promise.resolve());
  const revision = useRef(0);
  const mounted = useRef(true);
  const params = useRef({});
  params.current = {
    selectedPlatform,
    connectedPlatforms,
    refreshToken,
    getValidAccessToken,
    selectedRoutine,
    services,
    countdownSoundPlayer,
    isShuffled,
    isRepeating,
  };
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      revision.current++;
      const p = params.current;
      queue.current.then(() =>
        Promise.allSettled([
          ...Object.values(p.services || {}).map((service) => service.cleanup?.()),
          p.countdownSoundPlayer?.stop(),
        ]),
      );
    };
  }, []);
  const enqueue = useCallback((operation) => {
    const result = queue.current.then(operation);
    queue.current = result.catch((error) => {
      if (mounted.current) setAudioError(error.message || 'Music could not be played.');
    });
    return queue.current;
  }, []);
  const connection = useCallback(async (platform) => {
    const p = params.current;
    return {
      service: p.services?.[platform],
      token:
        platform === 'device'
          ? 'device'
          : p.getValidAccessToken
            ? await p.getValidAccessToken(platform)
            : p.connectedPlatforms?.[platform]?.accessToken,
      refresh: () => p.refreshToken?.(platform),
    };
  }, []);
  const check = (result) => {
    if (result?.success === false) throw new Error(result.error || 'Music playback failed.');
  };
  const stopActive = useCallback(async () => {
    const current = active.current;
    if (!current) return;
    active.current = null;
    if (current.platform === 'voices') await params.current.countdownSoundPlayer?.stop();
    else {
      const { service, token, refresh } = await connection(current.platform);
      if (service) {
        try {
          const result = await service.pause(token, refresh, current.deviceId);
          if (result?.code !== 'DEVICE_CHANGED') check(result);
        } finally {
          await service.cleanup?.();
        }
      }
    }
  }, [connection]);
  const fetchPlayback = useCallback(async () => {
    const current = active.current;
    if (!current || current.platform === 'voices') return;
    const version = revision.current;
    const { service, token, refresh } = await connection(current.platform);
    try {
      const playback = await service?.getCurrentPlayback(token, refresh);
      if (!mounted.current || version !== revision.current) return;
      if (
        current.platform === 'spotify' &&
        playback?.device?.id &&
        playback.device.id !== current.deviceId &&
        !playback.device.is_restricted
      ) {
        current.deviceId = playback.device.id;
        setAudioError(null);
      }
      if (!playback?.item) {
        if (playback && playback.is_playing === false) setIsMusicPlaying(false);
        return;
      }
      current.positionMs = playback.progress_ms ?? playback.progressMs ?? 0;
      const item = playback.item;
      setTrack({
        id: item.uri || item.id,
        title: item.name || item.title || 'Audio',
        artist: item.artists?.[0]?.name || item.artist || '',
        album: typeof item.album === 'string' ? item.album : item.album?.name || '',
        duration: (item.duration_ms || item.durationMs || 0) / 1000,
        coverUrl: item.album?.images?.[0]?.url || item.image || null,
      });
      setMusicProgress((playback.progress_ms || playback.progressMs || 0) / 1000);
      setIsMusicPlaying(
        !wantsPaused.current && (playback.is_playing ?? playback.isPlaying ?? false),
      );
    } catch (error) {
      if (mounted.current && version === revision.current) setAudioError(error.message);
    }
  }, [connection]);
  const handlePhaseChange = useCallback(
    (phase, roundNum, paused = false) => {
      const version = ++revision.current;
      wantsPaused.current = paused;
      pendingPhase.current = paused ? { phase, roundNum } : null;
      return enqueue(async () => {
        if (version !== revision.current) return;
        const p = params.current;
        const routine = p.selectedRoutine;
        if (!routine) return;
        const resolved = resolveRoundAudio(routine, phase, roundNum, p.selectedPlatform);
        await stopActive();
        if (!resolved) {
          if (mounted.current) {
            setTrack(null);
            setIsMusicPlaying(false);
            setMusicProgress(0);
            setAudioError(null);
          }
          return;
        }
        const { source, platform, kind, playlistId } = resolved;
        const song = kind === 'track';
        if (version !== revision.current) return;
        if (wantsPaused.current) {
          pendingPhase.current = { phase, roundNum };
          if (mounted.current) {
            setTrack({
              title: source.name || 'Audio',
              artist: source.artist || '',
              duration: source.duration || 0,
              coverUrl: source.image || null,
            });
            setMusicProgress(0);
            setIsMusicPlaying(false);
          }
          return;
        }
        if (platform === 'voices') {
          if (!paused) await p.countdownSoundPlayer?.play(source.uri);
          active.current = { platform, phase };
        } else {
          const { service, token, refresh } = await connection(platform);
          if (!service || !token)
            throw new Error(
              `Connect ${platform === 'spotify' ? 'Spotify' : 'your music source'} in Profile to play this round.`,
            );
          let deviceId =
            (await service.getActiveDevice?.(token, refresh)) ||
            (platform === 'device' ? 'device' : null);
          if (!deviceId)
            throw new Error('Open Spotify on a playback device, then resume the workout.');
          if (version !== revision.current) return;
          if (wantsPaused.current) {
            pendingPhase.current = { phase, roundNum };
            return;
          }
          const options = {
            ...source,
            name: source.name || source.title,
            shouldPlay: !wantsPaused.current,
            refreshCallback: refresh,
            isCancelled: () =>
              version !== revision.current || wantsPaused.current || !mounted.current,
          };
          const playResult = song
            ? await service.playTrack(token, source.uri, deviceId, options)
            : await service.playPlaylist(token, playlistId, deviceId, p.isShuffled, options);
          check(playResult);
          deviceId = playResult?.deviceId || deviceId;
          active.current = { platform, phase, deviceId, kind, source, playlistId, positionMs: 0 };
          if (wantsPaused.current) check(await service.pause(token, refresh, deviceId));
          if (service.setVolume && !playResult?.externalChange)
            await service.setVolume(
              token,
              phase === 'rest' ? (routine.restVolume ?? 100) : 100,
              deviceId,
            );
          if (service.setRepeat && !playResult?.externalChange)
            await service.setRepeat(
              token,
              p.isRepeating ? (song ? 'track' : 'context') : 'off',
              deviceId,
            );
        }
        if (version !== revision.current || !mounted.current) return;
        setAudioError(null);
        setTrack({
          id: source.uri || source.id,
          title: source.name || (song ? 'Audio' : 'Playlist'),
          artist: source.artist || '',
          album: source.album || '',
          duration: source.duration || 0,
          coverUrl: source.image || null,
        });
        setMusicProgress(0);
        setIsMusicPlaying(!wantsPaused.current);
        await fetchPlayback();
      });
    },
    [enqueue, connection, stopActive, fetchPlayback],
  );
  const pauseMusic = useCallback(() => {
    wantsPaused.current = true;
    return enqueue(async () => {
      await params.current.countdownSoundPlayer?.stop();
      const current = active.current;
      if (!current) return;
      if (current.platform === 'voices') await params.current.countdownSoundPlayer?.stop();
      else {
        const { service, token, refresh } = await connection(current.platform);
        const result = await service.pause(token, refresh, current.deviceId);
        if (result?.code !== 'DEVICE_CHANGED') check(result);
      }
      if (mounted.current) setIsMusicPlaying(false);
    });
  }, [enqueue, connection]);
  const resumeMusic = useCallback(() => {
    wantsPaused.current = false;
    const pending = pendingPhase.current;
    if (pending) {
      pendingPhase.current = null;
      return handlePhaseChange(pending.phase, pending.roundNum, false);
    }
    return enqueue(async () => {
      const current = active.current;
      if (!current) return;
      if (current.platform === 'voices') return;
      const { service, token, refresh } = await connection(current.platform);
      const version = ++revision.current;
      const options = {
        refreshCallback: refresh,
        isCancelled: () => version !== revision.current || wantsPaused.current || !mounted.current,
      };
      const target =
        current.platform === 'spotify'
          ? await service.getActiveDevice(token, refresh)
          : current.deviceId;
      if (!target) throw new Error('Open Spotify on the device you want to use, then resume.');
      if (options.isCancelled()) return;
      const result = await service.play(token, target, options);
      check(result);
      current.deviceId = result?.deviceId || target;
      if (version !== revision.current || wantsPaused.current) return;
      if (mounted.current) {
        setIsMusicPlaying(true);
        setAudioError(null);
      }
    });
  }, [enqueue, connection, handlePhaseChange]);
  const stopMusic = useCallback(() => {
    revision.current++;
    pendingPhase.current = null;
    return enqueue(async () => {
      try {
        await stopActive();
      } finally {
        await params.current.countdownSoundPlayer?.stop();
        if (mounted.current) {
          setTrack(null);
          setMusicProgress(0);
          setIsMusicPlaying(false);
        }
      }
    });
  }, [enqueue, stopActive]);
  const control = useCallback(
    (method, ...args) =>
      enqueue(async () => {
        const current = active.current;
        if (!current) return;
        const { service, token, refresh } = await connection(current.platform);
        if (!service?.[method]) return;
        check(await service[method](token, ...args, refresh, current.deviceId));
        await fetchPlayback();
      }),
    [enqueue, connection, fetchPlayback],
  );
  const skipNext = useCallback(() => control('next'), [control]);
  const skipPrevious = useCallback(() => control('previous'), [control]);
  const toggleShuffle = useCallback(() => {
    const value = !params.current.isShuffled;
    setIsShuffled(value);
    return enqueue(async () => {
      const c = active.current;
      if (!c) return;
      const { service, token } = await connection(c.platform);
      await service?.setShuffle?.(token, value, c.deviceId);
    });
  }, [enqueue, connection]);
  const toggleRepeat = useCallback(() => {
    const value = !params.current.isRepeating;
    setIsRepeating(value);
    return enqueue(async () => {
      const c = active.current;
      if (!c) return;
      const { service, token } = await connection(c.platform);
      await service?.setRepeat?.(
        token,
        value ? (c.kind === 'track' ? 'track' : 'context') : 'off',
        c.deviceId,
      );
    });
  }, [enqueue, connection]);
  const playCountdownSound = useCallback((type) => {
    const p = params.current;
    const key =
      type === 'beforeStart'
        ? 'countdownBeforeStartSound'
        : type === 'endWork'
          ? 'endWorkSound'
          : 'endRestSound';
    const sound = p.selectedRoutine?.[key];
    if (!sound?.uri) return;
    if (sound.platform === 'spotify') return; // Streaming controls cannot overlay a short alert.
    return p.countdownSoundPlayer?.play(sound.uri);
  }, []);
  return {
    track,
    isMusicPlaying,
    musicProgress,
    isShuffled,
    isRepeating,
    audioError,
    handlePhaseChange,
    pauseMusic,
    resumeMusic,
    stopMusic,
    fetchPlayback,
    skipNext,
    skipPrevious,
    toggleShuffle,
    toggleRepeat,
    playCountdownSound,
  };
};

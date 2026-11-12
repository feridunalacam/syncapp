import { useCallback, useEffect, useRef, useState } from 'react';
import { resolveRoundAudio, getPhaseMusicVolume, sameAudioSource } from '../domain/audio.js';

/** One serialized command stream prevents rapid phase changes racing audio loads. */
export const useAudioController = ({
  selectedPlatform,
  connectedPlatforms,
  refreshToken,
  getValidAccessToken,
  selectedRoutine,
  services,
  countdownSoundPlayer,
  stopLocalCues,
  onPlaybackInterrupted,
}) => {
  const [track, setTrack] = useState(null);
  const [isMusicPlaying, setIsMusicPlaying] = useState(false);
  const [musicProgress, setMusicProgress] = useState(0);
  const [isShuffled, setIsShuffled] = useState(false);
  const [isRepeating, setIsRepeating] = useState(false);
  const [audioError, setAudioError] = useState(null);
  const [localCuesAllowed, setLocalCuesAllowed] = useState(true);
  const localCuesAllowedRef = useRef(true);
  const active = useRef(null);
  const pendingPhase = useRef(null);
  const wantsPaused = useRef(false);
  const queue = useRef(Promise.resolve());
  const revision = useRef(0);
  const mounted = useRef(true);
  const commandCount = useRef(0);
  const loadingVersion = useRef(null);
  const requestedPhase = useRef(null);
  const interruption = useRef(null);
  const params = useRef({});
  params.current = {
    selectedPlatform,
    connectedPlatforms,
    refreshToken,
    getValidAccessToken,
    selectedRoutine,
    services,
    countdownSoundPlayer,
    stopLocalCues,
    onPlaybackInterrupted,
    isShuffled,
    isRepeating,
  };
  const allowLocalCues = useCallback((allowed) => {
    localCuesAllowedRef.current = allowed;
    if (mounted.current) setLocalCuesAllowed(allowed);
  }, []);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      wantsPaused.current = true;
      revision.current++;
      const p = params.current;
      const current = active.current;
      const silence = async (source) => {
        if (!source || source.platform === 'voices') return;
        const token =
          source.platform === 'device'
            ? 'device'
            : p.getValidAccessToken
              ? await p.getValidAccessToken(source.platform)
              : p.connectedPlatforms?.[source.platform]?.accessToken;
        await p.services?.[source.platform]?.pause(
          token,
          () => p.refreshToken?.(source.platform),
          source.deviceId,
        );
      };
      silence(current).catch(() => {});
      p.countdownSoundPlayer?.stop();
      queue.current.then(() =>
        Promise.allSettled([
          silence(active.current),
          ...Object.values(p.services || {}).map((service) => service.cleanup?.()),
          p.countdownSoundPlayer?.stop(),
        ]),
      );
    };
  }, []);
  const enqueue = useCallback((operation, isRelevant = () => true) => {
    commandCount.current++;
    const result = queue.current.then(operation);
    queue.current = result
      .catch((error) => {
        if (!isRelevant()) return { success: true, cancelled: true };
        if (mounted.current) setAudioError(error.message || 'Music could not be played.');
        return { success: false, error: error.message || 'Music could not be played.' };
      })
      .finally(() => {
        commandCount.current--;
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
    if (current.platform === 'voices') await params.current.countdownSoundPlayer?.stop();
    else {
      const { service, token, refresh } = await connection(current.platform);
      if (service) {
        try {
          const result = await service.pause(token, refresh, current.deviceId);
          if (result?.code !== 'DEVICE_CHANGED') check(result);
        } finally {
          await service.cleanup?.();
          // Local cleanup unloads the sound even if its pause failed. Spotify
          // has no unload operation: retain ownership until pause succeeds.
          if (current.platform === 'device' && active.current === current) active.current = null;
        }
      }
    }
    if (active.current === current) active.current = null;
  }, [connection]);
  const fetchPlayback = useCallback(async () => {
    const current = active.current;
    if (!current || current.platform === 'voices') return;
    const version = revision.current;
    const { service, token, refresh } = await connection(current.platform);
    try {
      const playback = await service?.getCurrentPlayback(token, refresh);
      if (!mounted.current || version !== revision.current) return;
      check(playback);
      if (
        current.platform === 'spotify' &&
        playback?.device?.id &&
        playback.device.id !== current.deviceId &&
        !playback.device.is_restricted
      ) {
        current.deviceId = playback.device.id;
        interruption.current = null;
        setAudioError(null);
      }
      if (!wantsPaused.current && commandCount.current === 0) {
        const stopped =
          !playback?.item || playback.is_playing === false || playback.isPlaying === false;
        if (stopped) {
          if (interruption.current == null) interruption.current = Date.now();
          else if (Date.now() - interruption.current >= 800) {
            interruption.current = null;
            params.current.onPlaybackInterrupted?.(
              'Music stopped or became unavailable. Resume when ready.',
            );
          }
        } else interruption.current = null;
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
      if (mounted.current && version === revision.current) {
        setAudioError(error.message);
        if (!wantsPaused.current && commandCount.current === 0)
          params.current.onPlaybackInterrupted?.(error.message);
      }
    }
  }, [connection]);
  const handlePhaseChange = useCallback(
    (phase, roundNum, paused = false) => {
      const version = ++revision.current;
      loadingVersion.current = version;
      requestedPhase.current = { phase, roundNum };
      interruption.current = null;
      wantsPaused.current = paused;
      pendingPhase.current = paused ? { phase, roundNum } : null;
      // Do not let a local cue overlap a Spotify start or an unfinished pause
      // during a source change. The old source must release playback first.
      allowLocalCues(false);
      return enqueue(
        async () => {
          if (version !== revision.current) return;
          const p = params.current;
          const routine = p.selectedRoutine;
          if (!routine) return;
          const resolved = resolveRoundAudio(routine, phase, roundNum, p.selectedPlatform);
          if (resolved?.platform === 'spotify') {
            await p.stopLocalCues?.();
            await p.countdownSoundPlayer?.stop();
            if (version !== revision.current || !mounted.current) return;
          }
          const volume = getPhaseMusicVolume(routine, phase);
          const current = active.current;
          // Preparation is the intro of the first Work track, not a separate playback.
          if (
            phase === 'work' &&
            roundNum === 1 &&
            current?.phase === 'beforeStart' &&
            current.platform !== 'voices' &&
            sameAudioSource(current, resolved)
          ) {
            current.phase = phase;
            pendingPhase.current = null;
            const { service, token, refresh } = await connection(current.platform);
            if (current.platform === 'spotify') {
              const target = await service.getActiveDevice?.(token, refresh);
              if (target) current.deviceId = target;
            }
            if (version !== revision.current || !mounted.current) return;
            if (service?.setVolume) await service.setVolume(token, volume, current.deviceId);
            if (version !== revision.current || !mounted.current) return;
            allowLocalCues(current.platform !== 'spotify');
            setAudioError(null);
            await fetchPlayback();
            return;
          }
          await stopActive();
          if (version !== revision.current || !mounted.current) return;
          allowLocalCues(resolved?.platform !== 'spotify');
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
            // Spotify volume belongs to the target device; set it before playback.
            // Local audio receives volume in its initial native loading status.
            if (platform === 'spotify' && service.setVolume)
              await service.setVolume(token, volume, deviceId);
            if (version !== revision.current || wantsPaused.current || !mounted.current) return;
            const options = {
              ...source,
              name: source.name || source.title,
              shouldPlay: !wantsPaused.current,
              volumePercent: volume,
              refreshCallback: refresh,
              isCancelled: () =>
                version !== revision.current || wantsPaused.current || !mounted.current,
            };
            active.current = { platform, phase, deviceId, kind, source, playlistId, positionMs: 0 };
            const playResult = song
              ? await service.playTrack(token, source.uri, deviceId, options)
              : await service.playPlaylist(token, playlistId, deviceId, p.isShuffled, options);
            check(playResult);
            if (playResult?.cancelled) {
              await service.pause(token, refresh, playResult.deviceId || deviceId);
              if (platform === 'device') active.current = null; // cancelled native loads already unload
              return playResult;
            }
            deviceId = playResult?.deviceId || deviceId;
            active.current = { platform, phase, deviceId, kind, source, playlistId, positionMs: 0 };
            if (wantsPaused.current) check(await service.pause(token, refresh, deviceId));
            if (version !== revision.current || !mounted.current) return;
            if (service.setVolume && !playResult?.externalChange)
              await service.setVolume(token, volume, deviceId);
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
        },
        () => version === revision.current,
      ).finally(() => {
        if (loadingVersion.current === version) loadingVersion.current = null;
      });
    },
    [enqueue, connection, stopActive, fetchPlayback, allowLocalCues],
  );
  const pauseMusic = useCallback(() => {
    wantsPaused.current = true;
    revision.current++;
    if (loadingVersion.current != null) pendingPhase.current = requestedPhase.current;
    // Alerts and an already-playing track must not wait behind a slow network load.
    const nowPlaying = active.current;
    const urgent = Promise.allSettled([
      params.current.countdownSoundPlayer?.stop(),
      commandCount.current > 0 && nowPlaying && nowPlaying.platform !== 'voices'
        ? connection(nowPlaying.platform).then(({ service, token, refresh }) =>
            service?.pause(token, refresh, nowPlaying.deviceId),
          )
        : null,
    ]);
    return enqueue(async () => {
      await urgent;
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
    wantsPaused.current = true;
    const version = ++revision.current;
    pendingPhase.current = null;
    params.current.countdownSoundPlayer?.stop();
    const current = active.current;
    if (commandCount.current > 0 && current && current.platform !== 'voices')
      connection(current.platform)
        .then(({ service, token, refresh }) => service?.pause(token, refresh, current.deviceId))
        .catch(() => {});
    return enqueue(async () => {
      try {
        await stopActive();
        if (version === revision.current) allowLocalCues(true);
      } finally {
        await params.current.countdownSoundPlayer?.stop();
        if (mounted.current) {
          setTrack(null);
          setMusicProgress(0);
          setIsMusicPlaying(false);
        }
      }
    });
  }, [enqueue, stopActive, connection, allowLocalCues]);
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
    if (!localCuesAllowedRef.current) return;
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
    localCuesAllowed,
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

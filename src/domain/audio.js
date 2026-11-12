/** Select one source per interval. A track overrides a playlist for that round. */
export const resolveRoundAudio = (routine, phase, roundNumber, selectedPlatform) => {
  if (!routine || !['beforeStart', 'work', 'rest'].includes(phase)) return null;
  if (phase === 'beforeStart') {
    phase = 'work';
    roundNumber = 1;
  }
  const round = routine.roundsData?.[roundNumber - 1] || {};
  const work = phase === 'work';
  const song = work ? round.workSong : round.restSong;
  // Edited routines have complete, visible round assignments. Retain legacy
  // playlist metadata without reviving music the user removed from a round.
  const fallbackPlaylist =
    routine.roundAudioOnly === true
      ? null
      : work
        ? routine.workoutPlaylistId
        : routine.restPlaylistId;
  const playlistId = work
    ? round.workPlaylistId || fallbackPlaylist
    : round.restPlaylistId || fallbackPlaylist;
  if (!song && !playlistId) return null;
  const source = song || {
    id: playlistId,
    name: work ? round.workPlaylistName : round.restPlaylistName,
    image: work ? round.workPlaylistImage : round.restPlaylistImage,
    platform: (work ? round.workPlaylistPlatform : round.restPlaylistPlatform) || routine.platform,
  };
  const platform = source.uri?.startsWith('spotify:')
    ? 'spotify'
    : source.uri?.startsWith('voices:')
      ? 'voices'
      : source.platform === 'url' || source.platform === 'browser'
        ? 'device'
        : source.platform || (song ? 'device' : selectedPlatform || 'spotify');
  return { source, platform, kind: song ? 'track' : 'playlist', playlistId };
};

export const getPhaseMusicVolume = (routine, phase) => {
  const fallback = phase === 'beforeStart' ? 50 : 100;
  const raw =
    phase === 'beforeStart'
      ? routine.preparationVolume
      : phase === 'rest'
        ? routine.restVolume
        : routine.workVolume;
  const value = raw == null ? fallback : Number(raw);
  return Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : fallback;
};

export const sameAudioSource = (a, b) =>
  !!a &&
  !!b &&
  a.platform === b.platform &&
  a.kind === b.kind &&
  (a.kind === 'track' ? a.source?.uri === b.source?.uri : a.playlistId === b.playlistId);

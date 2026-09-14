/** Select one source per interval. A track overrides a playlist for that round. */
export const resolveRoundAudio = (routine, phase, roundNumber, selectedPlatform) => {
  if (!routine || !['work', 'rest'].includes(phase)) return null;
  const round = routine.roundsData?.[roundNumber - 1] || {};
  const work = phase === 'work';
  const song = work ? round.workSong : round.restSong;
  const playlistId = work
    ? round.workPlaylistId || routine.workoutPlaylistId
    : round.restPlaylistId || routine.restPlaylistId;
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

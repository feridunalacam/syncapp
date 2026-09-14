/** Fisher–Yates: every track is used once before a shorter playlist repeats. */
export function distributePlaylist(tracks, roundNumbers, random = Math.random) {
  const playable = tracks.filter((track) => track?.uri && track.isPlayable !== false);
  if (!playable.length) return null;
  const shuffled = [...playable];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return Object.fromEntries(roundNumbers.map((round, i) => [round, shuffled[i % shuffled.length]]));
}

export function normalizeDetectedMedia(input) {
  if (!Array.isArray(input)) return [];
  const unique = new Map();
  for (const media of input) {
    if (typeof media?.url !== 'string' || !/^https?:\/\//i.test(media.url)) continue;
    if (unique.size >= 30) break;
    unique.set(media.url, {
      url: media.url,
      name:
        typeof media.name === 'string' && media.name.trim()
          ? media.name.trim().slice(0, 100)
          : 'Web audio',
    });
  }
  return [...unique.values()];
}

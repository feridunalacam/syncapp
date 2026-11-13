const MAX_ID_LENGTH = 200;
const MAX_TEXT_LENGTH = 200;
const MAX_IMAGE_LENGTH = 2048;
const nativeID = /^[A-Za-z0-9._-]+$/;
const playlistID = /^(?:p|pl)\.[A-Za-z0-9._-]+$/;

const text = (value, fallback = '') =>
  typeof value === 'string' ? value.trim().slice(0, MAX_TEXT_LENGTH) || fallback : fallback;
const imageURL = (value) => {
  if (typeof value !== 'string') return null;
  const raw = value.trim();
  if (!raw || raw.length > MAX_IMAGE_LENGTH || !/^https:\/\/\S+$/i.test(raw)) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) return null;
    return url.href.length <= MAX_IMAGE_LENGTH ? url.href : null;
  } catch {
    return null;
  }
};

/** A routine's independent player selection. Never infer it from timed round assignments. */
export function normalizeRoutineSoundtrack(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const { platform, kind, id } = value;
  if (
    platform !== 'appleMusic' ||
    !['track', 'playlist'].includes(kind) ||
    typeof id !== 'string' ||
    !id ||
    id.length > MAX_ID_LENGTH ||
    !nativeID.test(id) ||
    (kind === 'playlist' ? !playlistID.test(id) : /^(?:p|pl)\./.test(id))
  )
    return null;
  if (value.uri != null && (kind !== 'track' || value.uri !== `apple-music:song:${id}`))
    return null;
  // Save only public selection metadata; credentials/extra source fields never enter this object.
  return {
    platform: 'appleMusic',
    kind,
    id,
    name: text(value.name, kind === 'playlist' ? 'Apple Music playlist' : 'Apple Music track'),
    artist: text(value.artist),
    image: imageURL(value.image),
    // Shuffle is a playlist setting. Single-track playback has no shuffle selection.
    shuffle: kind === 'playlist' && value.shuffle === true,
  };
}

export function soundtrackPlaybackItem(value) {
  const soundtrack = normalizeRoutineSoundtrack(value);
  if (!soundtrack) return null;
  return {
    ...soundtrack,
    type: soundtrack.kind,
    ...(soundtrack.kind === 'track' ? { uri: `apple-music:song:${soundtrack.id}` } : {}),
  };
}

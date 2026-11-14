// Spotify public quota and commercial use have not been approved. Keep the
// integration in owner development builds until both release gates are met.
export function spotifyAvailable({ dev = false, profile, enabled } = {}) {
  return dev === true && !['preview', 'production'].includes(profile) && enabled !== 'false';
}

export const SPOTIFY_UNAVAILABLE_MESSAGE =
  'Spotify is unavailable in this version. Edit this routine to remove its Spotify music or replace it with Device or Browser audio.';

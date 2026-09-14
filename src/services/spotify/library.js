// Failures propagate to the UI; a failed page must not masquerade as an empty library.
export async function readSpotifyPages(url, token, request = fetch) {
  const items = [];
  const visited = new Set();
  while (url) {
    if (!url.startsWith('https://api.spotify.com/') || visited.has(url))
      throw new Error('Invalid pagination');
    visited.add(url);
    const response = await request(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) {
      const error = new Error('Spotify library request failed');
      error.status = response.status;
      error.userMessage =
        response.status === 401
          ? 'Reconnect Spotify to load your library.'
          : response.status === 403
            ? 'Spotify did not allow access to this library.'
            : response.status === 429
              ? 'Spotify is busy. Try again shortly.'
              : 'Could not load Spotify. Try again.';
      throw error;
    }
    const data = await response.json();
    items.push(...(data.items || []));
    url = data.next;
  }
  return items;
}

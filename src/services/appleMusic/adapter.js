const MESSAGES = {
  unavailable: 'To connect Apple Music, use the latest Sync app on iOS 16 or later.',
  denied: 'Allow Music access for Sync in Settings to connect Apple Music.',
  restricted: 'Music access is restricted on this device.',
  subscription: 'An active Apple Music subscription is required to play catalog songs.',
};

export function createAppleMusicService(native, { unavailableMessage } = {}) {
  const available = native?.supported === true;
  const fail = (code, fallback) => {
    const error = new Error(
      (code === 'unavailable' && unavailableMessage) ||
        MESSAGES[code] ||
        fallback ||
        'Apple Music could not complete this request. Please try again.',
    );
    error.code = code;
    error.userMessage = error.message;
    throw error;
  };
  const call = async (method, ...args) => {
    if (!available) fail('unavailable');
    try {
      return await native[method](...args);
    } catch {
      fail('request');
    }
  };
  const verify = (state) => {
    if (state?.status !== 'authorized')
      fail(state?.status === 'restricted' ? 'restricted' : 'denied');
    if (!state.canPlayCatalogContent) fail('subscription');
    return 'native:appleMusic'; // A local capability marker; MusicKit owns all credentials.
  };
  let revision = 0;
  const start = async (method, id, options = {}, shuffle = false) => {
    const ticket = ++revision;
    if (options.isCancelled?.()) return { success: true, cancelled: true };
    // Expo validates the bridge closure's arity, including its ignored parameters.
    // All three Swift start exports take (String, Bool), even track and resume.
    const result = await call(method, id, shuffle);
    if (ticket !== revision || result?.cancelled) return { success: true, cancelled: true };
    if (options.isCancelled?.()) {
      revision++;
      await call('pause');
      return { success: true, cancelled: true };
    }
    return result;
  };
  return {
    available,
    unavailableMessage,
    localPlaybackControl: available,
    // Keep local cues separate from MusicKit playback.
    allowsLocalCues: false,
    async authorize() {
      verify(await call('authorize'));
      return { authentication: 'native' };
    },
    async getAccessToken() {
      return { accessToken: verify(await call('getConnectionState')) };
    },
    search: (_token, query, types = ['track'], limit = 50) => call('search', query, types, limit),
    getUserPlaylists: () => call('getUserPlaylists'),
    async getPlaylistArtwork(_token, input) {
      if (!available) return [];
      try {
        if (typeof native.getPlaylistArtwork !== 'function' || !Array.isArray(input)) return [];
        const ids = [
          ...new Set(
            input.filter((id) => typeof id === 'string' && /^p\.[A-Za-z0-9._-]{1,180}$/.test(id)),
          ),
        ].slice(0, 8);
        if (!ids.length) return [];
        const rows = await call('getPlaylistArtwork', ids);
        if (!Array.isArray(rows)) return [];
        const artwork = new Map();
        for (const row of rows.slice(0, 64)) {
          if (!ids.includes(row?.id) || artwork.has(row.id) || typeof row.image !== 'string')
            continue;
          let url;
          try {
            url = new URL(row.image.trim());
          } catch {
            continue;
          }
          if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) continue;
          const result = { id: row.id, image: url.href };
          if (['library', 'catalog'].includes(row.artworkSource))
            result.artworkSource = row.artworkSource;
          artwork.set(row.id, result);
        }
        return ids.flatMap((id) => (artwork.has(id) ? [artwork.get(id)] : []));
      } catch {
        // Artwork is optional decoration, including on an older native binary.
        return [];
      }
    },
    getPlaylistTracks: (_token, id) => call('getPlaylistTracks', id),
    playTrack: (_token, uri, _device, options) => {
      const match = /^apple-music:song:([A-Za-z0-9._-]+)$/.exec(uri || '');
      if (!match)
        return Promise.resolve({
          success: false,
          error: 'Choose an Apple Music song for this round.',
        });
      return start('playTrack', match[1], options);
    },
    playPlaylist: (_token, id, _device, shuffle, options) =>
      start('playPlaylist', id, options, shuffle),
    async play(_token, _device, options = {}) {
      if (options.isCancelled?.()) return { success: true, cancelled: true };
      return start('resume', '', options);
    },
    pause: () => {
      revision++;
      return call('pause');
    },
    cleanup: () => {
      revision++;
      return available ? call('stop') : Promise.resolve();
    },
    releaseCurrent: () => {
      revision++;
      return call('releaseCurrent');
    },
    getActiveDevice: async () => {
      if (!available) fail('unavailable');
      return 'appleMusic';
    },
    getCurrentPlayback: () => call('getCurrentPlayback'),
    setRepeat: (_token, mode) => call('setRepeat', mode),
    setShuffle: (_token, enabled) => call('setShuffle', enabled),
    next: () => call('next'),
    previous: () => call('previous'),
    // MusicKit uses the device's system volume; do not change it behind the user's back.
  };
}

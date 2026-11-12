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

import { useCallback, useEffect, useRef, useState } from 'react';
import { distributePlaylist } from '../domain/musicLibrary.js';
const emptyLibrary = async () => [];

// Each list has its own request generation. Closing/switching invalidates in-flight work.
function useAsyncList() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const generation = useRef(0);
  useEffect(
    () => () => {
      generation.current++;
    },
    [],
  );
  const clear = useCallback(() => {
    generation.current++;
    setItems([]);
    setLoading(false);
    setError(null);
  }, []);
  const run = useCallback(async (request, message, { preserveItems = false } = {}) => {
    const ticket = ++generation.current;
    if (!preserveItems) setItems([]);
    setLoading(true);
    setError(null);
    try {
      const result = await request();
      if (ticket !== generation.current) return null;
      const list = Array.isArray(result) ? result.filter(Boolean) : [];
      setItems(list);
      return list;
    } catch (failure) {
      if (ticket !== generation.current) return null;
      setError(failure?.userMessage || message);
      return null;
    } finally {
      if (ticket === generation.current) setLoading(false);
    }
  }, []);
  return { items, loading, error, run, clear };
}

export const useMusicSearch = ({
  services,
  connectedPlatforms,
  refreshToken,
  getValidAccessToken,
  loadDeviceMusic = emptyLibrary,
}) => {
  const search = useAsyncList();
  const library = useAsyncList();
  const tracks = useAsyncList();
  const suggestions = useAsyncList();
  const [selectedPlaylistId, setSelectedPlaylistId] = useState(null);
  const remote = useCallback(
    async (platform, operation) => {
      const connection = connectedPlatforms?.[platform];
      const service = services?.[platform];
      if (!connection?.connected || !connection.accessToken || !service) {
        const error = new Error('Not connected');
        error.userMessage = 'Connect Spotify to load your music.';
        throw error;
      }
      try {
        const token = getValidAccessToken
          ? await getValidAccessToken(platform)
          : connection.accessToken;
        if (!token) throw new Error('Reconnect Spotify to continue.');
        return await operation(service, token);
      } catch (error) {
        if (error.status === 401 && refreshToken) {
          const token = await refreshToken(platform);
          if (token) return operation(service, token);
        }
        throw error;
      }
    },
    [services, connectedPlatforms, refreshToken, getValidAccessToken],
  );
  const searchMusic = useCallback(
    (query, platform, types = ['track']) =>
      search.run(async () => {
        if (!query.trim()) return [];
        if (platform === 'device')
          return (await loadDeviceMusic()).filter((track) =>
            [track.name, track.artist].some((value) =>
              value?.toLowerCase().includes(query.trim().toLowerCase()),
            ),
          );
        const result = await remote(platform, (service, token) =>
          service.search(token, query, types, 50),
        );
        return ['tracks', 'playlists', 'episodes'].flatMap((key) =>
          (result[key] || []).filter(Boolean).map((item) => ({
            ...item,
            type:
              item.type ||
              (key === 'playlists' ? 'playlist' : key === 'episodes' ? 'episode' : 'track'),
            platform,
          })),
        );
      }, 'Search failed. Try again.'),
    [search.run, remote, loadDeviceMusic],
  );
  const loadPlaylists = useCallback(
    (platform, options) =>
      library.run(
        async () => {
          if (platform !== 'spotify') return [];
          return (
            await remote(platform, (service, token) => service.getUserPlaylists(token, 50))
          ).map((item) => ({ ...item, type: 'playlist', platform }));
        },
        'Could not load playlists. Try again.',
        options,
      ),
    [library.run, remote],
  );
  const loadPlaylistTracks = useCallback(
    (id, platform) => {
      setSelectedPlaylistId(id);
      return tracks.run(async () => {
        if (!id) return [];
        return (
          await remote(platform, (service, token) => service.getPlaylistTracks(token, id))
        ).map((item) => ({ ...item, type: item.type || 'track', platform }));
      }, 'Could not load playlist tracks. Try again.');
    },
    [tracks.run, remote],
  );
  const loadSuggestedSongs = useCallback(
    (platform) =>
      suggestions.run(async () => {
        if (platform === 'device') return loadDeviceMusic();
        const result = await remote(platform, (service, token) =>
          service.search(token, 'workout', ['track'], 20),
        );
        return (result.tracks || []).map((item) => ({ ...item, type: 'track', platform }));
      }, 'Could not load music. Try again.'),
    [suggestions.run, loadDeviceMusic, remote],
  );
  const shufflePlaylistForRounds = useCallback(
    async (id, platform, roundNumbers) => {
      const list = await loadPlaylistTracks(id, platform);
      return list
        ? distributePlaylist(
            list,
            Array.isArray(roundNumbers)
              ? roundNumbers
              : Array.from({ length: roundNumbers }, (_, i) => i + 1),
          )
        : null;
    },
    [loadPlaylistTracks],
  );
  const reset = useCallback(() => {
    search.clear();
    library.clear();
    tracks.clear();
    suggestions.clear();
    setSelectedPlaylistId(null);
  }, [search.clear, library.clear, tracks.clear, suggestions.clear]);
  return {
    clearSearch: search.clear,
    searchResults: search.items,
    isSearching: search.loading,
    searchError: search.error,
    playlists: library.items,
    loadingPlaylists: library.loading,
    playlistError: library.error,
    playlistTracks: tracks.items,
    loadingPlaylistTracks: tracks.loading,
    tracksError: tracks.error,
    selectedPlaylistId,
    popularSongs: suggestions.items,
    loadingSongs: suggestions.loading,
    songsError: suggestions.error,
    searchMusic,
    loadPlaylists,
    loadPlaylistTracks,
    loadSuggestedSongs,
    shufflePlaylistForRounds,
    reset,
  };
};

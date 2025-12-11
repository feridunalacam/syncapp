import { useState, useCallback } from 'react';
import * as MediaLibrary from 'expo-media-library';

/**
 * Music Search Hook - Platform Agnostic Music Search & Browse
 * 
 * This hook handles all music search, playlist loading, and content discovery
 * for ANY platform (Spotify, Device, YouTube Music, SoundCloud, etc.)
 * 
 * @param {Object} params
 * @param {Object} params.services - All available platform services
 * @param {Object} params.connectedPlatforms - Map of connected platforms
 * @param {Function} params.refreshToken - Token refresh function
 */
export const useMusicSearch = ({ services, connectedPlatforms, refreshToken }) => {
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [playlists, setPlaylists] = useState([]);
  const [loadingPlaylists, setLoadingPlaylists] = useState(false);
  const [playlistTracks, setPlaylistTracks] = useState([]);
  const [loadingPlaylistTracks, setLoadingPlaylistTracks] = useState(false);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState(null);
  const [popularSongs, setPopularSongs] = useState([]);

  /**
   * Search for music (tracks, playlists, artists, etc.) on any platform
   */
  const searchMusic = useCallback(async (query, platform, searchTypes = ['track']) => {
    if (!query || query.trim().length < 1) {
      setSearchResults([]);
      return [];
    }

    setIsSearching(true);
    
    try {
      // Get platform service
      const service = services?.[platform];
      if (!service) {
        console.warn(`No service available for platform: ${platform}`);
        setSearchResults([]);
        return [];
      }

      // Check if platform is connected (except 'device' which is always available)
      if (platform !== 'device') {
        const platformData = connectedPlatforms?.[platform];
        if (!platformData?.connected || !platformData?.accessToken) {
          console.warn(`Platform ${platform} is not connected`);
          setSearchResults([]);
          return [];
        }
      }

      // Get access token (or 'device' for local files)
      const accessToken = platform === 'device' 
        ? 'device' 
        : connectedPlatforms[platform].accessToken;

      // Call platform-specific search
      let results = [];
      
      if (platform === 'device') {
        // Device: Search local files
        results = await searchDeviceMusic(query);
      } else if (service.search) {
        // Other platforms: Use service.search()
        const searchResult = await service.search(accessToken, query, searchTypes, 50);
        
        // Normalize results format across platforms
        results = [
          ...(searchResult.tracks || []),
          ...(searchResult.playlists || []),
          ...(searchResult.artists || []),
          ...(searchResult.albums || []),
          ...(searchResult.shows || []),
          ...(searchResult.episodes || []),
        ].map(item => ({
          ...item,
          platform, // Tag each result with platform
        }));
      }

      setSearchResults(results);
      return results;
    } catch (error) {
      console.error(`Error searching ${platform}:`, error);
      
      // Try to refresh token and retry once for non-device platforms
      if (platform !== 'device' && refreshToken) {
        try {
          const newToken = await refreshToken(platform);
          if (newToken) {
            const service = services[platform];
            const searchResult = await service.search(newToken, query, searchTypes, 50);
            const results = [
              ...(searchResult.tracks || []),
              ...(searchResult.playlists || []),
              ...(searchResult.artists || []),
              ...(searchResult.albums || []),
            ].map(item => ({ ...item, platform }));
            
            setSearchResults(results);
            return results;
          }
        } catch (retryError) {
          console.error('Error retrying search:', retryError);
        }
      }
      
      setSearchResults([]);
      return [];
    } finally {
      setIsSearching(false);
    }
  }, [services, connectedPlatforms, refreshToken]);

  /**
   * Search device music (local files)
   */
  const searchDeviceMusic = async (query) => {
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        console.warn('Media library permission not granted');
        return [];
      }

      const searchTerm = query.toLowerCase().trim();
      const results = [];

      // Search audio files
      const audioAssets = await MediaLibrary.getAssetsAsync({
        mediaType: MediaLibrary.MediaType.audio,
        first: 200,
        sortBy: MediaLibrary.SortBy.title,
      });

      // Get album info
      const albumIds = [...new Set(audioAssets.assets.map(asset => asset.albumId).filter(Boolean))];
      const albumMap = {};
      
      for (const albumId of albumIds) {
        try {
          const album = await MediaLibrary.getAlbumAsync(albumId);
          if (album) albumMap[albumId] = album.title;
        } catch (error) {
          console.warn(`Error fetching album ${albumId}:`, error);
        }
      }

      // Filter audio files
      for (const asset of audioAssets.assets) {
        const title = asset.filename.toLowerCase();
        const albumTitle = asset.albumId ? (albumMap[asset.albumId] || '').toLowerCase() : '';
        
        if (title.includes(searchTerm) || albumTitle.includes(searchTerm)) {
          results.push({
            id: asset.id,
            name: asset.filename.replace(/\.[^/.]+$/, ''),
            artist: asset.albumId ? (albumMap[asset.albumId] || 'Unknown Artist') : 'Unknown Artist',
            album: asset.albumId ? (albumMap[asset.albumId] || null) : null,
            image: null,
            duration: asset.duration,
            uri: asset.uri,
            type: 'track',
            source: 'device',
            platform: 'device',
          });
        }
      }

      return results;
    } catch (error) {
      console.error('Error searching device music:', error);
      return [];
    }
  };

  /**
   * Load user's playlists from a platform
   */
  const loadPlaylists = useCallback(async (platform) => {
    if (platform === 'device') {
      setPlaylists([]);
      return [];
    }

    const platformData = connectedPlatforms?.[platform];
    if (!platformData?.connected || !platformData?.accessToken) {
      setPlaylists([]);
      return [];
    }

    setLoadingPlaylists(true);
    try {
      const service = services?.[platform];
      if (!service || !service.getUserPlaylists) {
        console.warn(`Platform ${platform} does not support playlist loading`);
        setPlaylists([]);
        return [];
      }

      const accessToken = platformData.accessToken;
      const refreshCallback = refreshToken ? () => refreshToken(platform) : null;
      
      const userPlaylists = await service.getUserPlaylists(accessToken, 50, refreshCallback);
      
      const formatted = userPlaylists.map(playlist => ({
        ...playlist,
        platform, // Tag with platform
      }));
      
      setPlaylists(formatted);
      return formatted;
    } catch (error) {
      console.error(`Error loading ${platform} playlists:`, error);
      setPlaylists([]);
      return [];
    } finally {
      setLoadingPlaylists(false);
    }
  }, [services, connectedPlatforms, refreshToken]);

  /**
   * Load tracks from a playlist
   */
  const loadPlaylistTracks = useCallback(async (playlistId, platform) => {
    if (!playlistId || !platform) {
      setPlaylistTracks([]);
      return [];
    }

    const platformData = connectedPlatforms?.[platform];
    if (!platformData?.connected || !platformData?.accessToken) {
      setPlaylistTracks([]);
      return [];
    }

    setSelectedPlaylistId(playlistId);
    setLoadingPlaylistTracks(true);
    
    try {
      const service = services?.[platform];
      if (!service || !service.getPlaylistTracks) {
        console.warn(`Platform ${platform} does not support playlist tracks`);
        setPlaylistTracks([]);
        return [];
      }

      const accessToken = platformData.accessToken;
      const tracks = await service.getPlaylistTracks(accessToken, playlistId);
      
      const formatted = tracks.map(track => ({
        ...track,
        platform, // Tag with platform
      }));
      
      setPlaylistTracks(formatted);
      return formatted;
    } catch (error) {
      console.error(`Error loading playlist tracks:`, error);
      
      // Try refresh token
      if (refreshToken) {
        try {
          const newToken = await refreshToken(platform);
          if (newToken) {
            const service = services[platform];
            const tracks = await service.getPlaylistTracks(newToken, playlistId);
            const formatted = tracks.map(track => ({ ...track, platform }));
            setPlaylistTracks(formatted);
            return formatted;
          }
        } catch (retryError) {
          console.error('Error retrying playlist tracks:', retryError);
        }
      }
      
      setPlaylistTracks([]);
      return [];
    } finally {
      setLoadingPlaylistTracks(false);
    }
  }, [services, connectedPlatforms, refreshToken]);

  /**
   * Shuffle playlist and assign tracks to rounds
   */
  const shufflePlaylistForRounds = useCallback(async (playlistId, platform, roundCount, phase = 'work') => {
    try {
      const tracks = await loadPlaylistTracks(playlistId, platform);
      
      if (tracks.length === 0) {
        return null;
      }

      // Shuffle tracks
      const shuffled = [...tracks].sort(() => Math.random() - 0.5);
      
      // Distribute to rounds
      const roundSongs = {};
      for (let i = 1; i <= roundCount; i++) {
        const trackIndex = (i - 1) % shuffled.length;
        roundSongs[i] = shuffled[trackIndex];
      }
      
      return roundSongs;
    } catch (error) {
      console.error('Error shuffling playlist:', error);
      return null;
    }
  }, [loadPlaylistTracks]);

  /**
   * Load device music library (all audio files)
   */
  const loadDeviceMusic = async () => {
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        console.warn('Media library permission not granted');
        return [];
      }

      // Get all audio files from device
      const audioAssets = await MediaLibrary.getAssetsAsync({
        mediaType: MediaLibrary.MediaType.audio,
        first: 50, // Limit to 50 for suggestions
        sortBy: MediaLibrary.SortBy.modificationTime, // Most recent first
      });

      // Get album info
      const albumIds = [...new Set(audioAssets.assets.map(asset => asset.albumId).filter(Boolean))];
      const albumMap = {};
      
      for (const albumId of albumIds) {
        try {
          const album = await MediaLibrary.getAlbumAsync(albumId);
          if (album) albumMap[albumId] = album.title;
        } catch (error) {
          // Ignore album fetch errors
        }
      }

      // Map to track format
      const tracks = audioAssets.assets.map(asset => ({
        id: asset.id,
        name: asset.filename.replace(/\.[^/.]+$/, ''), // Remove file extension
        artist: asset.albumId ? (albumMap[asset.albumId] || 'Unknown Artist') : 'Unknown Artist',
        album: asset.albumId ? (albumMap[asset.albumId] || null) : null,
        image: null,
        duration: asset.duration,
        uri: asset.uri,
        type: 'track',
        source: 'device',
        platform: 'device',
      }));

      return tracks;
    } catch (error) {
      console.error('Error loading device music:', error);
      return [];
    }
  };

  /**
   * Load suggested/popular songs for a platform
   */
  const loadSuggestedSongs = useCallback(async (platform) => {
    // Device: Load music library as suggestions
    if (platform === 'device') {
      try {
        const deviceTracks = await loadDeviceMusic();
        setPopularSongs(deviceTracks);
        return deviceTracks;
      } catch (error) {
        console.error('Error loading device music:', error);
        setPopularSongs([]);
        return [];
      }
    }

    const platformData = connectedPlatforms?.[platform];
    
    if (!platformData?.connected || !platformData?.accessToken) {
      setPopularSongs([]);
      return [];
    }

    try {
      const service = services?.[platform];
      
      if (!service || !service.search) {
        setPopularSongs([]);
        return [];
      }

      const accessToken = platformData.accessToken;
      
      // Search for popular workout/motivational songs
      const popularQueries = ['workout', 'motivation', 'energy', 'gym'];
      const randomQuery = popularQueries[Math.floor(Math.random() * popularQueries.length)];
      
      const searchResult = await service.search(accessToken, randomQuery, ['track'], 20);
      
      const songs = (searchResult.tracks || []).map(track => ({
        ...track,
        platform,
      }));
      
      setPopularSongs(songs);
      return songs;
    } catch (error) {
      console.error(`Error loading suggested songs for ${platform}:`, error);
      setPopularSongs([]);
      return [];
    }
  }, [services, connectedPlatforms]);

  return {
    // State
    isSearching,
    searchResults,
    playlists,
    loadingPlaylists,
    playlistTracks,
    loadingPlaylistTracks,
    selectedPlaylistId,
    popularSongs,
    
    // Actions
    searchMusic,
    loadPlaylists,
    loadPlaylistTracks,
    shufflePlaylistForRounds,
    loadSuggestedSongs,
    
    // Setters (for manual control)
    setSearchResults,
    setPlaylists,
    setPlaylistTracks,
    setSelectedPlaylistId,
    setPopularSongs,
  };
};


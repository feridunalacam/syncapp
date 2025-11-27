import React, { useEffect, useState } from 'react';
import { 
  View, 
  Text, 
  TouchableOpacity, 
  Modal, 
  ScrollView, 
  TextInput, 
  Image, 
  ActivityIndicator,
  StyleSheet 
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '../../../context/ThemeContext';
import { usePlatformContext } from '../../../context/PlatformContext';
import { useMusicSearch } from '../../../hooks/useMusicSearch';
import { PlatformSelector } from '../../../components/common/PlatformSelector';

export const MusicSearchModal = ({
  visible,
  onClose,
  attachSongToRound,
  attachPlaylistToRound,
  selectedRoundForSong,
  songType,
  roundWorkSongs,
  roundRestSongs,
  roundWorkPlaylists = {},
  roundRestPlaylists = {},
}) => {
  const { theme } = useTheme();
  const { connectedPlatforms, services, refreshToken } = usePlatformContext();
  const styles = createStyles(theme);
  
  // Local state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchCategory, setSearchCategory] = useState('all');
  const [selectedPlatform, setSelectedPlatform] = useState(() => {
    // Default to Spotify if connected, otherwise device
    return connectedPlatforms?.spotify?.connected ? 'spotify' : 'device';
  });

  // Music search hook - handles all music operations
  const {
    isSearching,
    searchResults,
    playlists,
    loadingPlaylists,
    playlistTracks,
    loadingPlaylistTracks,
    selectedPlaylistId,
    popularSongs,
    searchMusic,
    loadPlaylists,
    loadPlaylistTracks,
    loadSuggestedSongs,
    setSearchResults,
  } = useMusicSearch({ services, connectedPlatforms, refreshToken });

  // Set default platform when modal opens
  useEffect(() => {
    if (visible) {
      const defaultPlatform = connectedPlatforms?.spotify?.connected ? 'spotify' : 'device';
      setSelectedPlatform(defaultPlatform);
    }
  }, [visible, connectedPlatforms]);

  // Load playlists when modal opens or platform changes
  useEffect(() => {
    if (visible && selectedPlatform !== 'device') {
      loadPlaylists(selectedPlatform);
    }
  }, [visible, selectedPlatform, loadPlaylists]);

  // Load suggested songs when modal opens
  useEffect(() => {
    if (visible && selectedPlatform !== 'device') {
      loadSuggestedSongs(selectedPlatform);
    }
  }, [visible, selectedPlatform, loadSuggestedSongs]);

  // Trigger search when query or category changes
  useEffect(() => {
    if (visible && searchQuery && searchQuery.trim().length >= 3) {
      const timeoutId = setTimeout(() => {
        // Determine search types based on category
        let types = ['track'];
        if (searchCategory === 'all') {
          types = ['track', 'artist', 'album', 'playlist', 'show', 'episode'];
        } else {
          types = [searchCategory];
        }
        
        searchMusic(searchQuery, selectedPlatform, types);
      }, 500);
      return () => clearTimeout(timeoutId);
    } else if (searchQuery.trim().length < 3) {
      setSearchResults([]);
    }
  }, [searchQuery, searchCategory, visible, selectedPlatform, searchMusic, setSearchResults]);

  // Handle platform change
  const handlePlatformSelect = (platformId) => {
    setSelectedPlatform(platformId);
    setSearchQuery('');
    setSearchResults([]);
    setSearchCategory('all');
  };

  const handleSelectSong = (song) => {
    if (selectedRoundForSong && songType) {
      attachSongToRound(selectedRoundForSong, song, songType);
    }
  };

  const handleSelectPlaylist = (playlist) => {
    if (selectedRoundForSong && songType) {
      attachPlaylistToRound(selectedRoundForSong, playlist, songType);
    }
  };

  const handleClose = () => {
    setSearchQuery('');
    setSearchResults([]);
    onClose();
  };

  const isSongAlreadyAttached = (songId) => {
    if (!selectedRoundForSong || !songType) return false;
    const songs = songType === 'work' ? roundWorkSongs : roundRestSongs;
    return songs[selectedRoundForSong]?.id === songId;
  };

  const isPlaylistAlreadyAttached = (playlistId) => {
    if (!selectedRoundForSong || !songType) return false;
    const playlists = songType === 'work' ? roundWorkPlaylists : roundRestPlaylists;
    return playlists[selectedRoundForSong]?.id === playlistId;
  };

  const renderSongItem = (song) => {
    const isAttached = isSongAlreadyAttached(song.id);
    
    return (
      <View
        key={song.id || Math.random()}
        style={[
          styles.resultItem,
          isAttached && styles.attachedItem
        ]}
      >
        <TouchableOpacity
          style={styles.resultItemContent}
          onPress={() => {
            if (!isAttached) {
              if (song.type === 'playlist') {
                handleSelectPlaylist(song);
              } else {
                handleSelectSong(song);
              }
            }
          }}
          disabled={isAttached}
          activeOpacity={0.7}
        >
          {song.image ? (
            <Image source={{ uri: song.image }} style={styles.resultImage} />
          ) : (
            <View style={[styles.resultImage, styles.placeholderImage]}>
              <Ionicons name="musical-note" size={20} color={theme.iconTertiary} />
            </View>
          )}
          <View style={styles.resultTextContainer}>
            <Text style={styles.resultTitle} numberOfLines={1}>
              {song.name || 'Unknown Track'}
            </Text>
            <Text style={styles.resultSubtitle} numberOfLines={1}>
              {song.type === 'track' ? (song.artist || 'Unknown Artist') : 
               song.type === 'album' ? `Album by ${song.artist || 'Unknown Artist'}` :
               song.type === 'artist' ? 'Artist' :
               song.type === 'playlist' ? `Playlist • ${song.owner || 'Unknown Owner'}` :
               song.type || 'Unknown'}
            </Text>
          </View>
        </TouchableOpacity>
        {isAttached ? (
          <Ionicons name="checkmark-circle" size={18} color={theme.success} />
        ) : (
          <TouchableOpacity
            onPress={() => {
              if (song.type === 'playlist') {
                handleSelectPlaylist(song);
              } else {
                handleSelectSong(song);
              }
            }}
            style={styles.addButton}
          >
            <Ionicons name="add-circle-outline" size={20} color={theme.iconTertiary} />
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const renderHorizontalPlaylistItem = (playlist) => {
    const isAttached = isPlaylistAlreadyAttached(playlist.id);
    
    return (
      <View key={playlist.id} style={{ width: 64, alignItems: 'center' }}>
        <TouchableOpacity
          onPress={() => {
            if (!isAttached) {
              handleSelectPlaylist(playlist);
            }
          }}
          style={{
            position: 'relative',
            borderRadius: 6,
            marginBottom: 6,
            borderWidth: isAttached ? 2 : 0,
            borderColor: isAttached ? theme.success : 'transparent',
            padding: 0,
            opacity: isAttached ? 0.7 : 1,
          }}
          disabled={isAttached}
        >
          {playlist.image ? (
            <Image 
              source={{ uri: playlist.image }} 
              style={{ width: 64, height: 64, borderRadius: 4 }} 
            />
          ) : (
            <View style={{
              width: 64,
              height: 64,
              borderRadius: 4,
              backgroundColor: theme.cardSecondary,
              borderWidth: 1,
              borderColor: theme.borderDark,
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <Ionicons name="albums" size={20} color={theme.iconTertiary} />
            </View>
          )}
          {isAttached && (
            <View style={{
              position: 'absolute',
              top: 2,
              right: 2,
              width: 16,
              height: 16,
              borderRadius: 8,
              backgroundColor: theme.success,
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <Ionicons name="checkmark" size={10} color={theme.textInverse} />
            </View>
          )}
        </TouchableOpacity>
        <Text 
          style={{ 
            fontSize: theme.fontSize.xs, 
            fontWeight: theme.fontWeight.semibold, 
            color: theme.text,
            textAlign: 'center',
            marginBottom: 2,
          }} 
          numberOfLines={2}
        >
          {playlist.name}
        </Text>
        <Text style={{ 
          fontSize: theme.fontSize.xs, 
          color: theme.textSecondary,
          textAlign: 'center',
        }}>
          {playlist.tracksCount} tracks
        </Text>
      </View>
    );
  };

  // Set default platform when modal opens
  useEffect(() => {
    if (visible) {
      const defaultPlatform = connectedPlatforms?.spotify?.connected ? 'spotify' : 'device';
      setSelectedPlatform(defaultPlatform);
    }
  }, [visible, connectedPlatforms]);

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="slide"
      onRequestClose={handleClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContainer}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>
              {selectedRoundForSong ? `Add ${songType === 'work' ? 'Work' : 'Rest'} Music` : 'Search Music'}
            </Text>
            <View style={styles.headerActions}>
              {/* Platform Selector */}
              <PlatformSelector
                selectedPlatform={selectedPlatform}
                onPlatformChange={handlePlatformSelect}
                connectedPlatforms={connectedPlatforms}
                includeDevice={true}
                style={{ marginRight: 8 }}
              />
              <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
                <Ionicons name="close" size={24} color={theme.text} />
              </TouchableOpacity>
            </View>
          </View>

          <ScrollView style={styles.scrollContainer} contentContainerStyle={styles.scrollContent}>
            {/* Playlists Section - At Top, Horizontal Scroll */}
            {playlists && playlists.length > 0 && (
              <View style={styles.playlistsSection}>
                <Text style={styles.sectionHeader}>Your Playlists</Text>
                {loadingPlaylists ? (
                  <View style={styles.loadingContainer}>
                    <ActivityIndicator size="small" color={theme.textSecondary} />
                    <Text style={styles.loadingText}>Loading playlists...</Text>
                  </View>
                ) : (
                  <ScrollView 
                    horizontal 
                    showsHorizontalScrollIndicator={false} 
                    contentContainerStyle={styles.horizontalPlaylistsContainer}
                  >
                    {playlists.map((playlist) => renderHorizontalPlaylistItem(playlist))}
                  </ScrollView>
                )}
              </View>
            )}

            {/* Search Bar */}
            <View style={styles.searchContainer}>
              <Ionicons name="search" size={20} color={theme.iconTertiary} style={styles.searchIcon} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search for songs, playlists, albums..."
                placeholderTextColor={theme.inputPlaceholder}
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoCapitalize="none"
                autoCorrect={false}
                multiline={false}
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearButton}>
                  <Ionicons name="close-circle" size={20} color={theme.iconTertiary} />
                </TouchableOpacity>
              )}
            </View>

            {/* Category Selector */}
            {selectedPlatform === 'spotify' && (
              <ScrollView 
                horizontal 
                showsHorizontalScrollIndicator={false}
                style={styles.categoryContainer}
                contentContainerStyle={styles.categoryContent}
              >
                {[
                  { id: 'all', label: 'All' },
                  { id: 'track', label: 'Songs' },
                  { id: 'show', label: 'Podcasts' },
                  { id: 'album', label: 'Albums' },
                  { id: 'playlist', label: 'Playlists' },
                  { id: 'audiobook', label: 'Audiobooks' },
                ].map((category) => (
                  <TouchableOpacity
                    key={category.id}
                    style={[
                      styles.categoryChip,
                      searchCategory === category.id && styles.activeCategoryChip
                    ]}
                    onPress={() => setSearchCategory(category.id)}
                  >
                    <Text style={[
                      styles.categoryChipText,
                      searchCategory === category.id && styles.activeCategoryChipText
                    ]}>
                      {category.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

            {/* Search Results Section */}
            <View style={styles.searchResultsSection}>
              {isSearching ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="large" color={theme.textSecondary} />
                  <Text style={styles.loadingText}>Searching...</Text>
                </View>
              ) : searchQuery.trim().length >= 3 && searchResults.length > 0 ? (
                <>
                  <Text style={styles.sectionHeader}>Search Results</Text>
                  {searchResults.map((item) => renderSongItem(item))}
                </>
              ) : searchQuery.trim().length >= 3 && searchResults.length === 0 ? (
                <View style={styles.emptyContainer}>
                  <Ionicons name="search-outline" size={48} color={theme.borderDark} />
                  <Text style={styles.emptyText}>No results found</Text>
                  <Text style={styles.emptySubtext}>Try a different search term</Text>
                </View>
              ) : popularSongs && popularSongs.length > 0 ? (
                <>
                  <Text style={styles.sectionHeader}>Popular Suggestions</Text>
                  {popularSongs.map((song) => renderSongItem(song))}
                </>
              ) : !playlists || playlists.length === 0 ? (
                <View style={styles.emptyContainer}>
                  <Ionicons name="musical-notes-outline" size={48} color={theme.borderDark} />
                  <Text style={styles.emptyText}>Start searching for music</Text>
                  <Text style={styles.emptySubtext}>Search for songs, playlists, or albums</Text>
                </View>
              ) : null}
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const createStyles = (theme) => StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: theme.modalOverlay,
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: theme.modalBackground,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
    height: '90%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: theme.spacing.xl,
    paddingBottom: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  headerTitle: {
    fontSize: theme.fontSize.xl,
    fontWeight: theme.fontWeight.bold,
    color: theme.text,
    flex: 1,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  closeButton: {
    padding: theme.spacing.xs,
  },
  scrollContainer: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: theme.spacing['4xl'],
  },
  playlistsSection: {
    paddingTop: theme.spacing.xl,
    paddingHorizontal: theme.spacing.xl,
    marginBottom: theme.spacing.xl,
  },
  sectionHeader: {
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.semibold,
    color: theme.textSecondary,
    marginBottom: theme.spacing.md,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  horizontalPlaylistsContainer: {
    gap: 10,
    paddingRight: theme.spacing.xs,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: theme.spacing.xl,
    marginBottom: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    height: 48,
    backgroundColor: theme.cardSecondary,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.border,
  },
  searchIcon: {
    marginRight: theme.spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: theme.inputText,
    padding: 0,
    height: 20,
    lineHeight: 20,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  clearButton: {
    padding: theme.spacing.xs,
    alignSelf: 'center',
  },
  categoryContainer: {
    marginBottom: theme.spacing.md,
  },
  categoryContent: {
    paddingHorizontal: theme.spacing.xl,
    gap: 6,
  },
  categoryChip: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
    borderRadius: 12,
    backgroundColor: theme.cardSecondary,
    borderWidth: 1,
    borderColor: theme.border,
  },
  activeCategoryChip: {
    backgroundColor: theme.text,
    borderColor: theme.text,
  },
  categoryChipText: {
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.medium,
    color: theme.textSecondary,
  },
  activeCategoryChipText: {
    color: theme.textInverse,
  },
  searchResultsSection: {
    paddingHorizontal: theme.spacing.xl,
    paddingTop: theme.spacing.xl,
  },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.xs,
    marginBottom: theme.spacing.xs,
    backgroundColor: 'transparent',
    borderRadius: 6,
  },
  attachedItem: {
    backgroundColor: theme.isDark ? 'rgba(16, 185, 129, 0.2)' : '#f0fdf4',
    opacity: 0.6,
  },
  resultItemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  resultImage: {
    width: 44,
    height: 44,
    borderRadius: 4,
    marginRight: 10,
  },
  placeholderImage: {
    backgroundColor: theme.cardSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultTextContainer: {
    flex: 1,
  },
  resultTitle: {
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.medium,
    color: theme.text,
    marginBottom: 2,
  },
  resultSubtitle: {
    fontSize: theme.fontSize.sm,
    color: theme.textTertiary,
  },
  addButton: {
    padding: theme.spacing.sm,
    marginLeft: theme.spacing.xs,
    opacity: 0.6,
  },
  loadingContainer: {
    paddingVertical: theme.spacing['4xl'],
    alignItems: 'center',
  },
  loadingText: {
    marginTop: theme.spacing.md,
    fontSize: theme.fontSize.base,
    color: theme.textSecondary,
  },
  emptyContainer: {
    paddingVertical: theme.spacing['4xl'],
    alignItems: 'center',
  },
  emptyText: {
    marginTop: theme.spacing.lg,
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.semibold,
    color: theme.textSecondary,
  },
  emptySubtext: {
    marginTop: theme.spacing.xs,
    fontSize: theme.fontSize.base,
    color: theme.textTertiary,
  },
});


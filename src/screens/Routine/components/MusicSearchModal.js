import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  ScrollView,
  TextInput,
  Image,
  ActivityIndicator,
  StyleSheet,
  Keyboard,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { WebView } from 'react-native-webview';
import { useTheme } from '../../../context/ThemeContext';
import { usePlatformContext } from '../../../context/PlatformContext';
import { useMusicSearch } from '../../../hooks/useMusicSearch';
import { PlatformSelector } from '../../../components/common/PlatformSelector';
import {
  BOOKMARK_SITES,
  DEFAULT_VOICES,
  MEDIA_DETECTION_SCRIPT,
} from './musicSearch/constants';
import { useDeviceMediaPicker } from './musicSearch/useDeviceMediaPicker';
import { useMediaWebView } from './musicSearch/useMediaWebView';

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
  isForCountdownSound = false, // New prop - if true, default to voices platform
}) => {
  const { theme } = useTheme();
  const { connectedPlatforms, services, refreshToken } = usePlatformContext();
  const styles = createStyles(theme);
  
  // Local state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchCategory, setSearchCategory] = useState('all');
  const [selectedPlatform, setSelectedPlatform] = useState(() => {
    if (isForCountdownSound) return 'voices';
    return connectedPlatforms?.spotify?.connected ? 'spotify' : 'device';
  });

  // Browser state lives in its own hook; the modal only consumes the values.
  const {
    webViewRef,
    scanIntervalRef,
    browserUrl,
    setBrowserUrl,
    detectedMedia,
    handleWebViewMessage,
    resetBrowser,
  } = useMediaWebView({ active: visible });

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
    setPlaylists,
    setPopularSongs,
  } = useMusicSearch({ services, connectedPlatforms, refreshToken });

  // Set default platform when modal opens
  useEffect(() => {
    if (visible) {
      // Default to voices if for countdown sound
      if (isForCountdownSound) {
        setSelectedPlatform('voices');
      } else {
        const defaultPlatform = connectedPlatforms?.spotify?.connected ? 'spotify' : 'device';
        setSelectedPlatform(defaultPlatform);
      }
    }
  }, [visible, connectedPlatforms, isForCountdownSound]);

  // Load playlists when modal opens or platform changes
  useEffect(() => {
    if (visible && selectedPlatform !== 'device' && selectedPlatform !== 'voices') {
      loadPlaylists(selectedPlatform);
    }
  }, [visible, selectedPlatform, loadPlaylists]);

  // Load suggested songs when modal opens (including device music)
  useEffect(() => {
    if (visible && selectedPlatform !== 'voices') {
      loadSuggestedSongs(selectedPlatform);
    }
  }, [visible, selectedPlatform, loadSuggestedSongs]);

  // Trigger search when query or category changes
  useEffect(() => {
    if (visible && searchQuery && searchQuery.trim().length >= 1) {
      const timeoutId = setTimeout(() => {
        // Determine search types based on category
        let types = ['track'];
        if (searchCategory === 'all') {
          types = ['track', 'artist', 'album', 'playlist', 'show', 'episode'];
        } else {
          types = [searchCategory];
        }
        
        searchMusic(searchQuery, selectedPlatform, types);
      }, 300); // Reduced delay for faster response
      return () => clearTimeout(timeoutId);
    } else if (searchQuery.trim().length < 1) {
      setSearchResults([]);
    }
  }, [searchQuery, searchCategory, visible, selectedPlatform, searchMusic, setSearchResults]);

  // Handle platform change - clear all previous platform data
  const handlePlatformSelect = (platformId) => {
    setSelectedPlatform(platformId);
    setSearchQuery('');
    setSearchResults([]);
    setSearchCategory('all');
    // Clear playlists and suggestions from previous platform
    setPlaylists([]);
    setPopularSongs([]);
  };

  const handleSelectSong = useCallback(
    (song) => {
      if (selectedRoundForSong && songType) {
        attachSongToRound(selectedRoundForSong, song, songType);
      }
    },
    [attachSongToRound, selectedRoundForSong, songType],
  );

  const handleSelectPlaylist = useCallback(
    (playlist) => {
      if (selectedRoundForSong && songType) {
        attachPlaylistToRound(selectedRoundForSong, playlist, songType);
      }
    },
    [attachPlaylistToRound, selectedRoundForSong, songType],
  );

  const handleClose = useCallback(() => {
    setSearchQuery('');
    setSearchResults([]);
    resetBrowser();
    onClose();
  }, [onClose, resetBrowser, setSearchResults]);

  // Whenever the device picker hands us a song, attach it and dismiss the
  // modal. Centralized here so every picker entry point shares the same
  // post-select behavior.
  const handleSongFromPicker = useCallback(
    (song) => {
      handleSelectSong(song);
      handleClose();
    },
    [handleSelectSong, handleClose],
  );

  const {
    isDownloading,
    handleMediaClick,
    handlePickFile,
    handlePickVoiceMemo,
    handlePickFromCameraRoll,
  } = useDeviceMediaPicker({ onSongSelected: handleSongFromPicker });

  // Aliased for readability inside the JSX below (the WebView prop name).
  const mediaDetectionScript = MEDIA_DETECTION_SCRIPT;


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
      <View key={playlist.id} style={styles.playlistItemContainer}>
        <TouchableOpacity
          onPress={() => {
            if (!isAttached) {
              handleSelectPlaylist(playlist);
            }
          }}
          style={[
            styles.playlistItemButton,
            isAttached && [styles.playlistItemButtonAttached, { borderColor: theme.success }]
          ]}
          disabled={isAttached}
        >
          {playlist.image ? (
            <Image source={{ uri: playlist.image }} style={styles.playlistImage} />
          ) : (
            <View style={styles.playlistImagePlaceholder}>
              <Ionicons name="albums" size={20} color={theme.iconTertiary} />
            </View>
          )}
          {isAttached && (
            <View style={styles.playlistCheckmark}>
              <Ionicons name="checkmark" size={10} color={theme.textInverse} />
            </View>
          )}
        </TouchableOpacity>
        <Text style={styles.playlistName} numberOfLines={2}>
          {playlist.name}
        </Text>
        <Text style={styles.playlistTracksCount}>
          {playlist.tracksCount} tracks
        </Text>
      </View>
    );
  };

  // Render voice item for Default Voices section
  const renderVoiceItem = (voice) => {
    const isAttached = roundWorkSongs?.[selectedRoundForSong]?.id === voice.id || 
                       roundRestSongs?.[selectedRoundForSong]?.id === voice.id;
    
    return (
      <View
        key={voice.id}
        style={[
          styles.resultItem,
          isAttached && styles.attachedItem
        ]}
      >
        <TouchableOpacity
          style={styles.resultItemContent}
          onPress={() => {
            if (!isAttached) {
              handleSelectSong(voice);
            }
          }}
          disabled={isAttached}
          activeOpacity={0.7}
        >
          <View style={[styles.resultImage, styles.placeholderImage, styles.voiceIconContainer]}>
            <Ionicons name="megaphone" size={20} color={theme.accent} />
          </View>
          <View style={styles.resultTextContainer}>
            <Text style={styles.resultTitle} numberOfLines={1}>
              {voice.name}
            </Text>
            <Text style={styles.resultSubtitle} numberOfLines={1}>
              Default Voice • {voice.duration}s
            </Text>
          </View>
        </TouchableOpacity>
        {isAttached ? (
          <Ionicons name="checkmark-circle" size={18} color={theme.success} />
        ) : (
          <TouchableOpacity
            onPress={() => handleSelectSong(voice)}
            style={styles.addButton}
          >
            <Ionicons name="add-circle-outline" size={20} color={theme.iconTertiary} />
          </TouchableOpacity>
        )}
      </View>
    );
  };

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
              {isForCountdownSound 
                ? 'Add Countdown Sound' 
                : selectedRoundForSong 
                  ? `Add ${songType === 'work' ? 'Work' : 'Rest'} Music` 
                  : 'Search Music'}
            </Text>
            <View style={styles.headerActions}>
              {/* Platform Selector */}
              <PlatformSelector
                selectedPlatform={selectedPlatform}
                onPlatformChange={handlePlatformSelect}
                connectedPlatforms={connectedPlatforms}
                includeDevice={true}
                includeBrowser={!isForCountdownSound}
                includeVoices={isForCountdownSound}
                style={styles.platformSelector}
              />
              <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
                <Ionicons name="close" size={24} color={theme.text} />
              </TouchableOpacity>
            </View>
          </View>

          <ScrollView style={styles.scrollContainer} contentContainerStyle={styles.scrollContent}>
            {/* Default Voices Section - Only show when voices platform is selected */}
            {selectedPlatform === 'voices' && (
              <View style={styles.searchResultsSection}>
                <Text style={styles.sectionHeader}>Default Voices</Text>
                <Text style={styles.sectionSubtext}>
                  Select a built-in countdown sound
                </Text>
                {DEFAULT_VOICES.map((voice) => renderVoiceItem(voice))}
              </View>
            )}

            {/* Playlists Section - At Top, Horizontal Scroll (hide for voices) */}
            {selectedPlatform !== 'voices' && playlists && playlists.length > 0 && (
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

            {/* Device: File Picker, Camera Roll, and Voice Memos */}
            {selectedPlatform === 'device' && (
              <View style={styles.deviceOptionsWrapper}>
                <View style={styles.deviceOptionsContainer}>
                  {/* Browse Files Button */}
                  <TouchableOpacity 
                    style={styles.deviceOptionButton} 
                    onPress={handlePickFile}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="folder-open" size={20} color={theme.accent} />
                    <Text style={styles.deviceOptionText}>Files</Text>
                  </TouchableOpacity>

                  {/* Camera Roll Button */}
                  <TouchableOpacity 
                    style={styles.deviceOptionButton} 
                    onPress={handlePickFromCameraRoll}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="videocam" size={20} color={theme.accent} />
                    <Text style={styles.deviceOptionText}>Videos</Text>
                  </TouchableOpacity>

                  {/* Voice Memos Button */}
                  <TouchableOpacity 
                    style={styles.deviceOptionButton} 
                    onPress={handlePickVoiceMemo}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="mic" size={20} color={theme.accent} />
                    <Text style={styles.deviceOptionText}>Voice</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Browser Platform - WebView with bookmarks and detection */}
            {selectedPlatform === 'browser' && (
              <View style={styles.browserContainer}>
                {/* Bookmarks */}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.bookmarksScroll}>
                  {BOOKMARK_SITES.map((site) => (
                    <TouchableOpacity 
                      key={site.name}
                      style={[styles.bookmarkChip, { backgroundColor: site.color }]}
                      onPress={() => setBrowserUrl(site.url)}
                    >
                      <Text style={styles.bookmarkText}>{site.name}</Text>
                    </TouchableOpacity>
                  ))}
                  <TouchableOpacity 
                    style={[styles.bookmarkChip, styles.googleBookmark]}
                    onPress={() => setBrowserUrl('https://www.google.com/search?q=free+sound+effects+download')}
                  >
                    <Ionicons name="search" size={14} color="#fff" style={styles.bookmarkIcon} />
                    <Text style={styles.bookmarkText}>Google</Text>
                  </TouchableOpacity>
                </ScrollView>

                {/* WebView */}
                <View style={styles.webViewContainer}>
                  <WebView
                    ref={webViewRef}
                    source={{ uri: browserUrl }}
                    style={styles.webView}
                    onLoadEnd={() => {
                      webViewRef.current?.injectJavaScript(mediaDetectionScript);
                      if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
                      scanIntervalRef.current = setInterval(() => {
                        webViewRef.current?.injectJavaScript(mediaDetectionScript);
                      }, 2000);
                    }}
                    onMessage={handleWebViewMessage}
                    javaScriptEnabled={true}
                    domStorageEnabled={true}
                    allowsInlineMediaPlayback={true}
                  />
                </View>

                {/* Detected Media List */}
                {detectedMedia.length > 0 && (
                  <View style={styles.detectedMediaSection}>
                    <Text style={styles.detectedMediaTitle}>
                      🎵 {detectedMedia.length} dosya bulundu
                    </Text>
                    <ScrollView 
                      horizontal 
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.detectedMediaScroll}
                    >
                      {detectedMedia.map((media, index) => (
                        <TouchableOpacity
                          key={index}
                          style={styles.detectedMediaCard}
                          onPress={() => handleMediaClick(media)}
                          activeOpacity={0.8}
                        >
                          <View style={styles.detectedMediaCardIcon}>
                            <Ionicons name="musical-note" size={24} color="#fff" />
                          </View>
                          <Text style={styles.detectedMediaCardName} numberOfLines={2}>
                            {media.name}
                          </Text>
                          <View style={styles.detectedMediaCardAdd}>
                            <Ionicons name="add" size={16} color={theme.accent} />
                            <Text style={styles.detectedMediaCardAddText}>Ekle</Text>
                          </View>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                )}

                {/* Download indicator */}
                {isDownloading && (
                  <View style={styles.downloadingIndicator}>
                    <ActivityIndicator size="small" color={theme.accent} />
                    <Text style={styles.downloadingText}>Downloading…</Text>
                  </View>
                )}
              </View>
            )}

            {/* Search Bar - Hide for voices and browser platforms */}
            {selectedPlatform !== 'voices' && selectedPlatform !== 'browser' && (
              <View style={styles.searchContainer}>
                <Ionicons name="search" size={20} color={theme.iconTertiary} style={styles.searchIcon} />
                <TextInput
                  style={styles.searchInput}
                  placeholder={selectedPlatform === 'device' ? "Search your music..." : "Search for songs, playlists, albums..."}
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
            )}

            {/* Category Selector */}
            {selectedPlatform === 'spotify' && selectedPlatform !== 'voices' && (
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

            {/* Search Results Section - Hide for voices and browser platforms */}
            {selectedPlatform !== 'voices' && selectedPlatform !== 'browser' && (
              <View style={styles.searchResultsSection}>
                {isSearching ? (
                  <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color={theme.textSecondary} />
                    <Text style={styles.loadingText}>Searching...</Text>
                  </View>
                ) : searchQuery.trim().length >= 1 && searchResults.length > 0 ? (
                  <>
                    <Text style={styles.sectionHeader}>Search Results</Text>
                    {searchResults.map((item) => renderSongItem(item))}
                  </>
                ) : searchQuery.trim().length >= 1 && searchResults.length === 0 ? (
                  <View style={styles.emptyContainer}>
                    <Ionicons name="search-outline" size={48} color={theme.borderDark} />
                    <Text style={styles.emptyText}>No results found</Text>
                    <Text style={styles.emptySubtext}>
                      {selectedPlatform === 'device' 
                        ? 'Make sure you have music files on your device and granted media access'
                        : 'Try a different search term'}
                    </Text>
                  </View>
                ) : popularSongs && popularSongs.length > 0 ? (
                  <>
                    <Text style={styles.sectionHeader}>
                      {selectedPlatform === 'device' ? 'Your Music' : 'Popular Suggestions'}
                    </Text>
                    {popularSongs.map((song) => renderSongItem(song))}
                  </>
                ) : selectedPlatform === 'device' ? (
                  <View style={styles.emptyContainer}>
                    <Ionicons name="phone-portrait-outline" size={48} color={theme.borderDark} />
                    <Text style={styles.emptyText}>Search your device music</Text>
                    <Text style={styles.emptySubtext}>Start typing to search your music library</Text>
                  </View>
                ) : !playlists || playlists.length === 0 ? (
                  <View style={styles.emptyContainer}>
                    <Ionicons name="musical-notes-outline" size={48} color={theme.borderDark} />
                    <Text style={styles.emptyText}>Start searching for music</Text>
                    <Text style={styles.emptySubtext}>Search for songs, playlists, or albums</Text>
                  </View>
                ) : null}
              </View>
            )}
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
  deviceOptionsContainer: {
    flexDirection: 'row',
    paddingHorizontal: theme.spacing.xl,
    paddingTop: theme.spacing.lg,
    gap: theme.spacing.md,
  },
  deviceOptionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    backgroundColor: theme.cardSecondary,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.border,
  },
  deviceOptionText: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.semibold,
    color: theme.accent,
  },
  // Browser styles
  browserContainer: {
    flex: 1,
    paddingTop: theme.spacing.sm,
  },
  bookmarksScroll: {
    paddingHorizontal: theme.spacing.lg,
    marginBottom: theme.spacing.sm,
    maxHeight: 40,
  },
  bookmarkChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
    borderRadius: 16,
    marginRight: theme.spacing.xs,
  },
  bookmarkText: {
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.semibold,
    color: '#fff',
  },
  webViewContainer: {
    flex: 1,
    marginHorizontal: theme.spacing.md,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: theme.border,
    minHeight: 300,
  },
  webView: {
    flex: 1,
    backgroundColor: '#fff',
  },
  detectedMediaSection: {
    marginTop: theme.spacing.sm,
    paddingBottom: theme.spacing.sm,
  },
  detectedMediaTitle: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.semibold,
    color: theme.textSecondary,
    marginBottom: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
  },
  detectedMediaScroll: {
    paddingHorizontal: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  detectedMediaCard: {
    width: 100,
    backgroundColor: theme.cardSecondary,
    borderRadius: 12,
    padding: theme.spacing.sm,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.border,
  },
  detectedMediaCardIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing.xs,
  },
  detectedMediaCardName: {
    fontSize: 11,
    fontWeight: theme.fontWeight.medium,
    color: theme.text,
    textAlign: 'center',
    height: 28,
    marginBottom: theme.spacing.xs,
  },
  detectedMediaCardAdd: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 4,
    backgroundColor: theme.accentLight,
    borderRadius: 10,
  },
  detectedMediaCardAddText: {
    fontSize: 10,
    fontWeight: theme.fontWeight.semibold,
    color: theme.accent,
  },
  downloadingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  downloadingText: {
    fontSize: theme.fontSize.sm,
    color: theme.accent,
    fontWeight: theme.fontWeight.medium,
  },
  deviceOptionsWrapper: {
    paddingTop: theme.spacing.lg,
  },
  // Playlist item styles
  playlistItemContainer: {
    width: 64,
    alignItems: 'center',
  },
  playlistItemButton: {
    position: 'relative',
    borderRadius: 6,
    marginBottom: 6,
    borderWidth: 0,
    padding: 0,
  },
  playlistItemButtonAttached: {
    borderWidth: 2,
    opacity: 0.7,
  },
  playlistImage: {
    width: 64,
    height: 64,
    borderRadius: 4,
  },
  playlistImagePlaceholder: {
    width: 64,
    height: 64,
    borderRadius: 4,
    backgroundColor: theme.cardSecondary,
    borderWidth: 1,
    borderColor: theme.borderDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playlistCheckmark: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: theme.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playlistName: {
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.semibold,
    color: theme.text,
    textAlign: 'center',
    marginBottom: 2,
  },
  playlistTracksCount: {
    fontSize: theme.fontSize.xs,
    color: theme.textSecondary,
    textAlign: 'center',
  },
  voiceIconContainer: {
    backgroundColor: theme.accentLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  googleBookmark: {
    backgroundColor: '#333',
  },
  bookmarkIcon: {
    marginRight: 4,
  },
  platformSelector: {
    marginRight: 8,
  },
  sectionSubtext: {
    fontSize: theme.fontSize.sm,
    color: theme.textSecondary,
    marginBottom: theme.spacing.md,
  },
});


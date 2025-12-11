import React, { useEffect, useState, useRef } from 'react';
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
  Alert,
  Keyboard,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { WebView } from 'react-native-webview';
import { useTheme } from '../../../context/ThemeContext';
import { usePlatformContext } from '../../../context/PlatformContext';
import { useMusicSearch } from '../../../hooks/useMusicSearch';
import { PlatformSelector } from '../../../components/common/PlatformSelector';

// === CONSTANTS ===
const AUDIO_MIME_TYPES = [
  'audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/aac',
  'audio/wav', 'audio/x-wav', 'audio/flac', 'audio/ogg', 'audio/webm',
];

const VIDEO_MIME_TYPES = [
  'video/mp4', 'video/quicktime', 'video/x-msvideo',
  'video/x-matroska', 'video/webm', 'video/3gpp',
];

const BOOKMARK_SITES = [
  { url: 'https://mixkit.co/free-sound-effects/', name: 'Mixkit', color: '#FF6B35' },
  { url: 'https://pixabay.com/sound-effects/', name: 'Pixabay', color: '#00AB6C' },
  { url: 'https://freesound.org/', name: 'Freesound', color: '#1E88E5' },
  { url: 'https://www.zapsplat.com/', name: 'ZapSplat', color: '#9C27B0' },
];

const DEFAULT_BROWSER_URL = 'https://mixkit.co/free-sound-effects/';

// Default countdown voice sounds
const DEFAULT_VOICES = [
  // Beeps & Tones
  { id: 'beep_short', name: 'Quick Beep', type: 'voice', platform: 'voices', uri: 'voices://beep_short', duration: 1 },
  { id: 'beep_long', name: 'Long Beep', type: 'voice', platform: 'voices', uri: 'voices://beep_long', duration: 2 },
  { id: 'tone_high', name: 'High Tone', type: 'voice', platform: 'voices', uri: 'voices://tone_high', duration: 1 },
  { id: 'tone_low', name: 'Low Tone', type: 'voice', platform: 'voices', uri: 'voices://tone_low', duration: 1 },
  // Bells
  { id: 'bell', name: 'Bell Ding', type: 'voice', platform: 'voices', uri: 'voices://bell', duration: 1 },
  { id: 'gong', name: 'Gong', type: 'voice', platform: 'voices', uri: 'voices://gong', duration: 2 },
  { id: 'boxing_bell', name: 'Boxing Bell', type: 'voice', platform: 'voices', uri: 'voices://boxing_bell', duration: 1 },
  // Alarms
  { id: 'whistle', name: 'Whistle', type: 'voice', platform: 'voices', uri: 'voices://whistle', duration: 1 },
  { id: 'buzzer', name: 'Buzzer', type: 'voice', platform: 'voices', uri: 'voices://buzzer', duration: 1 },
  { id: 'air_horn', name: 'Air Horn', type: 'voice', platform: 'voices', uri: 'voices://air_horn', duration: 2 },
  // Countdown signals
  { id: 'countdown_321', name: 'Countdown Beeps', type: 'voice', platform: 'voices', uri: 'voices://countdown_321', duration: 4 },
  { id: 'countdown_go', name: 'Start Signal', type: 'voice', platform: 'voices', uri: 'voices://countdown_go', duration: 1 },
  { id: 'countdown_start', name: 'Ready Signal', type: 'voice', platform: 'voices', uri: 'voices://countdown_start', duration: 2 },
  { id: 'success', name: 'Success Chime', type: 'voice', platform: 'voices', uri: 'voices://success', duration: 1 },
];

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
    // Default to voices if for countdown sound, otherwise Spotify/device
    if (isForCountdownSound) return 'voices';
    return connectedPlatforms?.spotify?.connected ? 'spotify' : 'device';
  });
  
  // Browser state
  const [browserUrl, setBrowserUrl] = useState(DEFAULT_BROWSER_URL);
  const [detectedMedia, setDetectedMedia] = useState([]);
  const [isDownloading, setIsDownloading] = useState(false);
  const webViewRef = useRef(null);
  const scanIntervalRef = useRef(null);

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

  // Helper: Create song object
  const createSongObject = (config) => ({
    id: config.id || `${config.source}-${Date.now()}`,
    name: config.name,
    artist: config.artist || 'Unknown',
    album: config.album || null,
    image: config.image || null,
    duration: config.duration || 0,
    uri: config.uri,
    type: config.type || 'track',
    source: config.source,
    platform: config.platform || 'device',
    ...(config.isVideo && { isVideo: true }),
  });

  const handleClose = () => {
    setSearchQuery('');
    setSearchResults([]);
    setBrowserUrl(DEFAULT_BROWSER_URL);
    setDetectedMedia([]);
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
    onClose();
  };

  // Media detection script for WebView
  const mediaDetectionScript = `
    (function() {
      const mediaExtensions = ['mp3', 'm4a', 'wav', 'aac', 'ogg', 'flac', 'mp4', 'mov', 'webm', 'avi'];
      const mediaFiles = [];
      
      const isMediaUrl = (url) => {
        if (!url) return false;
        const lower = url.toLowerCase();
        return mediaExtensions.some(ext => lower.includes('.' + ext));
      };
      
      const getCleanName = (url, text) => {
        let name = text || '';
        if (!name || name.length < 2) {
          name = decodeURIComponent(url.split('/').pop().split('?')[0] || 'Audio');
        }
        return name.replace(/\\.[^/.]+$/, '').substring(0, 60);
      };
      
      // Find links
      document.querySelectorAll('a[href]').forEach(link => {
        if (isMediaUrl(link.href)) {
          mediaFiles.push({ url: link.href, name: getCleanName(link.href, link.textContent.trim()) });
        }
      });
      
      // Find audio/video elements
      document.querySelectorAll('audio, video').forEach(el => {
        const src = el.src || el.currentSrc;
        if (src) mediaFiles.push({ url: src, name: getCleanName(src, '') });
        el.querySelectorAll('source').forEach(s => {
          if (s.src) mediaFiles.push({ url: s.src, name: getCleanName(s.src, '') });
        });
      });
      
      // Find download buttons
      document.querySelectorAll('[download], [data-download], .download').forEach(el => {
        const href = el.href || el.getAttribute('data-href');
        if (href && isMediaUrl(href)) {
          mediaFiles.push({ url: href, name: getCleanName(href, el.textContent.trim()) });
        }
      });
      
      const unique = [...new Map(mediaFiles.map(item => [item.url, item])).values()];
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'media', data: unique.slice(0, 30) }));
    })();
    true;
  `;

  // Handle WebView messages
  const handleWebViewMessage = (event) => {
    try {
      const message = JSON.parse(event.nativeEvent.data);
      if (message.type === 'media') {
        setDetectedMedia(message.data || []);
      }
    } catch (e) {}
  };

  // Download file from URL
  const downloadFromUrl = async (url, name) => {
    try {
      setIsDownloading(true);
      const filename = name || url.split('/').pop().split('?')[0] || 'audio';
      const ext = url.split('.').pop()?.split('?')[0]?.toLowerCase() || 'mp3';
      const safeFilename = filename.replace(/[^a-zA-Z0-9]/g, '_') + '_' + Date.now() + '.' + ext;
      const fileUri = FileSystem.cacheDirectory + safeFilename;
      
      const result = await FileSystem.downloadAsync(url, fileUri);
      setIsDownloading(false);
      
      if (result?.uri && result.status === 200) {
        const song = createSongObject({
          name: filename.replace(/\.[^/.]+$/, ''),
          artist: 'Downloaded',
          uri: result.uri,
          source: 'device',
        });
        handleSelectSong(song);
        handleClose();
      } else {
        throw new Error('Download failed');
      }
    } catch (error) {
      setIsDownloading(false);
      Alert.alert('İndirme Hatası', 'Dosya indirilemedi.');
    }
  };

  // Add URL directly (streaming)
  const addFromUrl = (url, name) => {
    const filename = name || url.split('/').pop().split('?')[0] || 'Audio';
    const song = createSongObject({
      name: filename.replace(/\.[^/.]+$/, ''),
      artist: 'Web Audio',
      uri: url,
      source: 'url',
    });
    handleSelectSong(song);
    handleClose();
  };

  // Handle detected media click
  const handleMediaClick = (media) => {
    Alert.alert(
      media.name,
      'Bu dosyayı nasıl eklemek istersiniz?',
      [
        { text: 'İptal', style: 'cancel' },
        { text: 'URL Olarak Çal', onPress: () => addFromUrl(media.url, media.name) },
        { text: 'İndir', onPress: () => downloadFromUrl(media.url, media.name) },
      ]
    );
  };

  // Pick audio/video file from Files app
  const handlePickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [...AUDIO_MIME_TYPES, ...VIDEO_MIME_TYPES],
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const file = result.assets[0];
        const fileName = file.name || 'Unknown';
        const extension = fileName.split('.').pop()?.toLowerCase() || '';
        const isVideo = ['mp4', 'mov', 'avi', 'mkv', 'm4v', 'webm'].includes(extension);
        
        const song = createSongObject({
          name: fileName.replace(/\.[^/.]+$/, ''),
          artist: isVideo ? 'Video File' : 'Local File',
          uri: file.uri,
          source: 'device',
          isVideo,
        });
        handleSelectSong(song);
        handleClose();
      }
    } catch (error) {
      console.error('Error picking file:', error);
      Alert.alert('Error', 'Failed to pick file');
    }
  };

  // Pick voice memo / audio recording
  const handlePickVoiceMemo = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: AUDIO_MIME_TYPES,
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const file = result.assets[0];
        const fileName = file.name || 'Voice Memo';
        const song = createSongObject({
          name: fileName.replace(/\.[^/.]+$/, ''),
          artist: 'Voice Memo',
          uri: file.uri,
          source: 'device',
        });
        handleSelectSong(song);
        handleClose();
      }
    } catch (error) {
      console.error('Error picking voice memo:', error);
      Alert.alert('Error', 'Failed to pick voice memo');
    }
  };

  // Pick video from Camera Roll / Photos library
  const handlePickFromCameraRoll = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please allow access to your photo library to select videos.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Videos,
        allowsEditing: false,
        quality: 1,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const video = result.assets[0];
        const uriParts = video.uri.split('/');
        const fileName = uriParts[uriParts.length - 1] || `Video_${Date.now()}`;
        
        const song = createSongObject({
          name: fileName.replace(/\.[^/.]+$/, ''),
          artist: 'Camera Roll',
          duration: video.duration ? Math.floor(video.duration / 1000) : 0,
          uri: video.uri,
          source: 'device',
          isVideo: true,
        });
        handleSelectSong(song);
        handleClose();
      }
    } catch (error) {
      console.error('Error picking from camera roll:', error);
      Alert.alert('Error', 'Failed to pick video from camera roll');
    }
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
                    <Text style={styles.downloadingText}>İndiriliyor...</Text>
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


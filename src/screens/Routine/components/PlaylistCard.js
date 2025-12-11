import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Image, ActivityIndicator, TextInput, Alert } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '../../../context/ThemeContext';
import { usePlatformContext } from '../../../context/PlatformContext';
import { useMusicSearch } from '../../../hooks/useMusicSearch';
import { PlatformSelector } from '../../../components/common/PlatformSelector';
import { createScreenStyles } from '../../../styles/screenStyles';

export const PlaylistCard = ({ 
  roundsOrder,
  onShuffleForWork,
  onShuffleForRest,
  embedded = false, // When true, renders without container (for embedding in another card)
}) => {
  const { theme, isDark } = useTheme();
  const screenStyles = createScreenStyles({ ...theme, isDark });
  const { connectedPlatforms, services, refreshToken } = usePlatformContext();
  const [selectedPlaylistId, setSelectedPlaylistId] = useState(null);
  const [selectedPlatform, setSelectedPlatform] = useState(() => {
    // Default to Spotify if connected, otherwise device
    return connectedPlatforms?.spotify?.connected ? 'spotify' : 'device';
  });
  const [searchQuery, setSearchQuery] = useState('');
  
  // Local search state (separate from MusicSearchModal)
  const [localSearchResults, setLocalSearchResults] = useState([]);
  const [localIsSearching, setLocalIsSearching] = useState(false);

  // Music search hook
  const {
    playlists,
    loadingPlaylists,
    searchMusic,
    loadPlaylists,
    shufflePlaylistForRounds,
  } = useMusicSearch({ services, connectedPlatforms, refreshToken });

  // Load playlists when component mounts or platform changes
  useEffect(() => {
    if (selectedPlatform !== 'device') {
      loadPlaylists(selectedPlatform);
    }
  }, [selectedPlatform, loadPlaylists]);

  const handlePlatformSelect = (platformId) => {
    setSelectedPlatform(platformId);
    setSearchQuery('');
  };

  // Trigger search when query changes
  useEffect(() => {
    if (searchQuery && searchQuery.trim().length >= 3) {
      const timeoutId = setTimeout(async () => {
        setLocalIsSearching(true);
        const results = await searchMusic(searchQuery, selectedPlatform, ['playlist']);
        // Filter to only playlists
        const playlistResults = results?.filter(item => item.type === 'playlist') || [];
        setLocalSearchResults(playlistResults);
        setLocalIsSearching(false);
      }, 500);
      return () => clearTimeout(timeoutId);
    } else {
      setLocalSearchResults([]);
      setLocalIsSearching(false);
    }
  }, [searchQuery, selectedPlatform, searchMusic]);

  // Determine which playlists to show: search results if searching, otherwise user playlists
  const displayPlaylists = searchQuery && searchQuery.trim().length >= 3 
    ? localSearchResults 
    : playlists;
  
  const displayLoading = searchQuery && searchQuery.trim().length >= 3 
    ? localIsSearching 
    : loadingPlaylists;

  const handlePlaylistSelect = (playlistId) => {
    if (selectedPlaylistId === playlistId) {
      setSelectedPlaylistId(null);
    } else {
      setSelectedPlaylistId(playlistId);
    }
  };

  // Find selected playlist from displayPlaylists (works for both user playlists and search results)
  const selectedPlaylist = displayPlaylists.find(p => p.id === selectedPlaylistId);

  // Handle shuffle for work
  const handleShuffleWork = async () => {
    if (!selectedPlaylist || !roundsOrder || roundsOrder.length === 0) return;

    try {
      const roundSongs = await shufflePlaylistForRounds(
        selectedPlaylist.id,
        selectedPlatform,
        roundsOrder.length,
        'work'
      );

      if (roundSongs && onShuffleForWork) {
        onShuffleForWork(selectedPlaylist, roundSongs);
      }
    } catch (error) {
      console.error('Error shuffling for work:', error);
      Alert.alert('Error', 'Failed to shuffle playlist for work rounds.');
    }
  };

  // Handle shuffle for rest
  const handleShuffleRest = async () => {
    if (!selectedPlaylist || !roundsOrder || roundsOrder.length === 0) return;

    try {
      const roundSongs = await shufflePlaylistForRounds(
        selectedPlaylist.id,
        selectedPlatform,
        roundsOrder.length,
        'rest'
      );

      if (roundSongs && onShuffleForRest) {
        onShuffleForRest(selectedPlaylist, roundSongs);
      }
    } catch (error) {
      console.error('Error shuffling for rest:', error);
      Alert.alert('Error', 'Failed to shuffle playlist for rest rounds.');
    }
  };

  // Content to render (used in both embedded and standalone modes)
  const content = (
    <>
      {/* Content */}
      <View style={screenStyles.cardContent}>
        {/* Search Input with Platform Selector */}
        <View style={{ 
          flexDirection: 'row', 
          alignItems: 'center',
          gap: theme.spacing.sm,
          marginBottom: theme.spacing.md,
        }}>
          {/* Search Input */}
          <View style={{ 
            flex: 1,
            flexDirection: 'row', 
            alignItems: 'center',
            position: 'relative',
          }}>
            <Ionicons 
              name="search-outline" 
              size={16} 
              color={theme.iconTertiary} 
              style={{ position: 'absolute', left: 10, zIndex: 1 }}
            />
            <TextInput
              style={{
                flex: 1,
                borderWidth: 1,
                borderColor: theme.inputBorder,
                borderRadius: 8,
                paddingLeft: theme.spacing['3xl'],
                paddingRight: (searchQuery && searchQuery.length > 0) ? theme.spacing['3xl'] : theme.spacing.md,
                paddingVertical: theme.spacing.sm,
                height: 36,
                fontSize: theme.fontSize.sm,
                color: theme.inputText,
                backgroundColor: theme.inputBackground,
              }}
              placeholder="Search any playlist..."
              placeholderTextColor={theme.inputPlaceholder}
              value={searchQuery || ''}
              onChangeText={setSearchQuery}
              returnKeyType="search"
            />
            {searchQuery && searchQuery.length > 0 && (
              <TouchableOpacity
                onPress={() => {
                  setSearchQuery('');
                }}
                style={{ position: 'absolute', right: theme.spacing.sm, padding: theme.spacing.xs }}
              >
                <Ionicons name="close-circle" size={16} color={theme.iconTertiary} />
              </TouchableOpacity>
            )}
          </View>
          
          {/* Platform Selector */}
          <PlatformSelector
            selectedPlatform={selectedPlatform}
            onPlatformChange={handlePlatformSelect}
            connectedPlatforms={connectedPlatforms}
            includeDevice={false}
            includeBrowser={false}
            buttonStyle={{
              height: 36,
              minWidth: 90,
              paddingHorizontal: theme.spacing.md,
              paddingVertical: theme.spacing.xs,
              backgroundColor: theme.cardSecondary,
              borderRadius: 8,
            }}
          />
        </View>

        {/* Playlists */}
        <View style={{ minHeight: 80 }}>
        {displayLoading ? (
          <View style={{ 
            height: 80,
            paddingVertical: theme.spacing.md, 
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <ActivityIndicator size="small" color={theme.textSecondary} />
          </View>
        ) : displayPlaylists.length > 0 ? (
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false} 
            contentContainerStyle={{ gap: theme.spacing.sm, paddingRight: theme.spacing.xs }}
            style={{ minHeight: 80 }}
          >
            {displayPlaylists.map((playlist) => {
              const isSelected = selectedPlaylistId === playlist.id;
              return (
                <DraggablePlaylistItem
                  key={playlist.id}
                  playlist={playlist}
                  isSelected={isSelected}
                  onSelect={() => handlePlaylistSelect(playlist.id)}
                  theme={theme}
                />
              );
            })}
          </ScrollView>
        ) : (
          <View style={{ 
            height: 80,
            padding: theme.spacing.lg, 
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.cardSecondary, 
            borderRadius: 8 
          }}>
            <Ionicons name="musical-notes-outline" size={24} color={theme.iconTertiary} />
            <Text style={{ color: theme.textSecondary, marginTop: 6, textAlign: 'center', fontSize: theme.fontSize.sm }}>
              {connectedPlatforms?.spotify?.connected
                ? searchQuery && searchQuery.trim().length >= 3
                  ? 'No playlists found' 
                  : 'No playlists found'
                : 'Connect a platform to see your playlists'}
            </Text>
          </View>
        )}
      </View>

        {/* Shuffle Buttons - Show when playlist is selected */}
        {selectedPlaylist && (
          <View style={{ 
            flexDirection: 'row', 
            gap: theme.spacing.sm, 
            marginTop: theme.spacing.md,
          }}>
            <TouchableOpacity
              onPress={handleShuffleWork}
              style={{
                flex: 1,
                paddingVertical: theme.spacing.sm,
                paddingHorizontal: theme.spacing.md,
                backgroundColor: theme.cardSecondary,
                borderRadius: 8,
                alignItems: 'center',
              }}
            >
              <Text style={{ fontSize: theme.fontSize.xs, color: theme.textSecondary }}>
                Shuffle for Work
              </Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              onPress={handleShuffleRest}
              style={{
                flex: 1,
                paddingVertical: theme.spacing.sm,
                paddingHorizontal: theme.spacing.md,
                backgroundColor: theme.cardSecondary,
                borderRadius: 8,
                alignItems: 'center',
              }}
            >
              <Text style={{ fontSize: theme.fontSize.xs, color: theme.textSecondary }}>
                Shuffle for Rest
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </>
  );

  // If embedded, return content without container
  if (embedded) {
    return content;
  }

  // Standalone mode with container
  return (
    <View style={screenStyles.card}>
      {content}
    </View>
  );
};

// Playlist Item Component
const DraggablePlaylistItem = ({ playlist, isSelected, onSelect, theme: themeProp }) => {
  const { theme } = useTheme();
  const effectiveTheme = themeProp || theme;
  
  return (
    <View style={{ width: 48, alignItems: 'center' }}>
      <TouchableOpacity
        onPress={onSelect}
        style={{
          position: 'relative',
          borderRadius: 4,
          marginBottom: effectiveTheme.spacing.xs,
          borderWidth: isSelected ? 1 : 0,
          borderColor: isSelected ? effectiveTheme.textTertiary : 'transparent',
          padding: 0,
        }}
      >
          {playlist.image ? (
            <Image 
              source={{ uri: playlist.image }} 
              style={{ width: 48, height: 48, borderRadius: 4 }} 
            />
          ) : (
            <View style={{
              width: 48,
              height: 48,
              borderRadius: 4,
              backgroundColor: effectiveTheme.cardSecondary,
              borderWidth: 1,
              borderColor: effectiveTheme.borderDark,
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <Ionicons name="musical-notes" size={16} color={effectiveTheme.iconTertiary} />
            </View>
          )}
          {isSelected && (
            <View style={{
              position: 'absolute',
              top: 2,
              right: 2,
              width: 14,
              height: 14,
              borderRadius: 7,
              backgroundColor: effectiveTheme.isDark ? 'rgba(255, 255, 255, 0.8)' : 'rgba(0, 0, 0, 0.6)',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <Ionicons name="checkmark" size={9} color={effectiveTheme.textInverse} />
            </View>
          )}
        </TouchableOpacity>
        <View style={{ 
          height: 28,
          justifyContent: 'center',
          alignItems: 'center',
        }}>
          <Text 
            style={{ 
              fontSize: effectiveTheme.fontSize.xs, 
              fontWeight: effectiveTheme.fontWeight.semibold, 
              color: effectiveTheme.text,
              textAlign: 'center',
              lineHeight: 14,
            }} 
            numberOfLines={2}
          >
            {playlist.name}
          </Text>
        </View>
    </View>
  );
};

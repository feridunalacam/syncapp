import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { PLATFORMS } from '../../context/PlatformContext';
import { useTheme } from '../../context/ThemeContext';
import SpotifyLogo from '../../screens/Profile/components/SpotifyLogo';

export const PlatformSelector = ({
  selectedPlatform,
  onPlatformChange,
  connectedPlatforms = {},
  includeDevice = true,
  includeBrowser = false,
  style,
  buttonStyle,
}) => {
  const { theme } = useTheme();
  const styles = createStyles(theme);
  const [showPlatformDropdown, setShowPlatformDropdown] = useState(false);

  // Build available platforms list
  const availablePlatforms = [
    ...(includeDevice 
      ? [{ id: 'device', name: 'Device', icon: 'phone-portrait-outline', color: theme.textSecondary }]
      : []
    ),
    ...(includeBrowser 
      ? [{ id: 'browser', name: 'Browser', icon: 'globe-outline', color: theme.textSecondary }]
      : []
    ),
    ...(connectedPlatforms?.spotify?.connected 
      ? [PLATFORMS.spotify] 
      : []
    ),
  ];

  const currentPlatform = selectedPlatform === 'device' 
    ? { id: 'device', name: 'Device', icon: 'phone-portrait-outline', color: theme.textSecondary }
    : selectedPlatform === 'browser'
    ? { id: 'browser', name: 'Browser', icon: 'globe-outline', color: theme.textSecondary }
    : PLATFORMS[selectedPlatform];

  const handlePlatformSelect = (platformId) => {
    setShowPlatformDropdown(false);
    if (onPlatformChange) {
      onPlatformChange(platformId);
    }
  };

  if (availablePlatforms.length === 0) {
    return null;
  }

  return (
    <View style={[styles.container, style]}>
      <TouchableOpacity
        onPress={() => setShowPlatformDropdown(!showPlatformDropdown)}
        style={[styles.platformSelectorButton, buttonStyle]}
      >
        {currentPlatform?.id === 'spotify' ? (
          <View style={styles.spotifyIconContainer}>
            <SpotifyLogo iconSize={14} size={10} showText={false} style={{ gap: 0 }} />
          </View>
        ) : (
          <Ionicons 
            name={currentPlatform?.icon || 'musical-notes'} 
            size={16} 
            color={currentPlatform?.color || '#6b7280'} 
          />
        )}
        <Text style={styles.platformSelectorText}>
          {currentPlatform?.name || 'Device'}
        </Text>
        <Ionicons 
          name={showPlatformDropdown ? "chevron-up" : "chevron-down"} 
          size={12} 
          color="#6b7280" 
        />
      </TouchableOpacity>

      {showPlatformDropdown && (
        <View style={styles.platformDropdown}>
          {availablePlatforms.map((platform, index) => (
            <TouchableOpacity
              key={platform.id}
              onPress={() => handlePlatformSelect(platform.id)}
              style={[
                styles.platformDropdownItem,
                selectedPlatform === platform.id && styles.platformDropdownItemSelected,
                index === availablePlatforms.length - 1 && styles.platformDropdownItemLast
              ]}
            >
              {platform.id === 'spotify' ? (
                <View style={styles.spotifyIconContainer}>
                  <SpotifyLogo iconSize={16} size={12} showText={false} style={{ gap: 0 }} />
                </View>
              ) : (
                <Ionicons 
                  name={platform.icon} 
                  size={16} 
                  color={platform.color || '#6b7280'} 
                />
              )}
              <Text style={[
                styles.platformDropdownText,
                selectedPlatform === platform.id && styles.platformDropdownTextSelected
              ]}>
                {platform.name}
              </Text>
              {selectedPlatform === platform.id && (
                <Ionicons name="checkmark" size={16} color={theme.buttonPrimary} />
              )}
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
};

const createStyles = (theme) => StyleSheet.create({
  container: {
    position: 'relative',
  },
  platformSelectorButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 6,
    backgroundColor: theme.card,
    minHeight: 32,
  },
  platformSelectorText: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
    color: theme.text,
  },
  spotifyIconContainer: {
    width: 14,
    height: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  platformDropdown: {
    position: 'absolute',
    top: 32,
    right: 0,
    backgroundColor: theme.modalBackground,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 8,
    minWidth: 140,
    zIndex: 1000,
    ...theme.shadow.md,
  },
  platformDropdownItem: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.borderLight,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    backgroundColor: theme.card,
  },
  platformDropdownItemLast: {
    borderBottomWidth: 0,
  },
  platformDropdownItemSelected: {
    backgroundColor: theme.cardSecondary,
  },
  platformDropdownText: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
    color: theme.text,
    flex: 1,
  },
  platformDropdownTextSelected: {
    fontWeight: theme.fontWeight.semibold,
  },
});


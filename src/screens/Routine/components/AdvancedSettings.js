import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import Slider from '@react-native-community/slider';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '../../../context/ThemeContext';
import { createScreenStyles } from '../../../styles/screenStyles';
import { CountdownPicker } from './CountdownPicker';

/**
 * Sound Alert Card - for End Work and End Rest
 * Similar style to CountdownPicker but without duration selector
 */
const SoundAlertCard = ({ label, sound, onPress, onRemove }) => {
  const { theme } = useTheme();
  const isActive = !!sound;

  return (
    <View style={{ 
      flex: 1,
      backgroundColor: theme.cardSecondary,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: isActive ? theme.accent : theme.border,
      overflow: 'hidden',
    }}>
      {/* Label */}
      <Text style={{ 
        fontSize: theme.fontSize.xs, 
        color: isActive ? theme.accent : theme.textSecondary,
        textAlign: 'center',
        paddingTop: theme.spacing.sm,
        fontWeight: theme.fontWeight.semibold,
      }}>
        {label}
      </Text>

      {/* Icon/Status area - same height as picker */}
      <View style={{
        height: 80,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <View style={{
          width: 40,
          height: 40,
          borderRadius: 20,
          backgroundColor: isActive ? theme.accent : theme.border,
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <Ionicons 
            name={isActive ? "volume-high" : "volume-mute"} 
            size={20} 
            color={isActive ? '#fff' : theme.textTertiary} 
          />
        </View>
      </View>

      {/* Sound Button */}
      <TouchableOpacity
        onPress={isActive ? onRemove : onPress}
        style={{
          backgroundColor: isActive ? theme.accentLight : 'transparent',
          padding: theme.spacing.sm,
          alignItems: 'center',
          flexDirection: 'row',
          justifyContent: 'center',
          gap: theme.spacing.xs,
          borderTopWidth: 1,
          borderTopColor: theme.border,
        }}
      >
        <Ionicons 
          name={isActive ? "close-circle" : "musical-note"} 
          size={12} 
          color={isActive ? theme.accent : theme.iconTertiary} 
        />
        <Text 
          style={{ 
            fontSize: theme.fontSize.xs, 
            color: isActive ? theme.accent : theme.textTertiary,
          }} 
          numberOfLines={1}
        >
          {isActive ? (sound.name?.substring(0, 6) || 'Sound') : 'Add'}
        </Text>
      </TouchableOpacity>
    </View>
  );
};

/**
 * Advanced Settings component for routine creation
 * 
 * Sound Alerts:
 * - Before Start: Duration picker + sound (countdown before workout)
 * - End Work: Sound at end of work phase
 * - End Rest: Sound at end of rest phase
 */
export const AdvancedSettings = ({
  // Visibility
  isExpanded,
  onToggle,
  // Rest Volume
  restVolume,
  onRestVolumeChange,
  // Before Start - has duration picker
  countdownBeforeStartSec,
  onCountdownBeforeStartSecChange,
  countdownBeforeStartSound,
  // End Work & End Rest sounds
  endWorkSound,
  endRestSound,
  // Sound picker handlers
  onSoundPickerOpen,
  onSoundRemove,
}) => {
  const { theme, isDark } = useTheme();
  const screenStyles = createScreenStyles({ ...theme, isDark });

  return (
    <View style={screenStyles.card}>
      {/* Header - Collapsible Toggle */}
      <TouchableOpacity
        onPress={onToggle}
        style={screenStyles.cardSectionHeaderWithBorder}
      >
        <Text style={screenStyles.cardSectionTitle}>
          Advanced Settings
        </Text>
        <Ionicons 
          name={isExpanded ? "chevron-up" : "chevron-down"} 
          size={20} 
          color={theme.textSecondary} 
        />
      </TouchableOpacity>

      {/* Collapsible Content */}
      {isExpanded && (
        <View style={screenStyles.cardContent}>
          {/* Rest Volume Section */}
          <View style={{ marginBottom: theme.spacing.xl }}>
            <Text style={{ 
              fontSize: theme.fontSize.sm, 
              fontWeight: theme.fontWeight.semibold, 
              color: theme.text,
              marginBottom: theme.spacing.md,
            }}>
              Rest Volume
            </Text>
            <View style={{ 
              flexDirection: 'row', 
              alignItems: 'center', 
              gap: theme.spacing.md 
            }}>
              <Ionicons 
                name="volume-low" 
                size={20} 
                color={theme.textSecondary} 
              />
              <Slider
                style={{ flex: 1, height: 40 }}
                minimumValue={10}
                maximumValue={100}
                step={10}
                value={restVolume}
                onValueChange={onRestVolumeChange}
                minimumTrackTintColor={theme.accent}
                maximumTrackTintColor={theme.border}
                thumbTintColor={theme.accent}
              />
              <Ionicons 
                name="volume-high" 
                size={20} 
                color={theme.textSecondary} 
              />
              <Text style={{ 
                fontSize: theme.fontSize.sm, 
                color: theme.text,
                minWidth: 40,
                textAlign: 'right',
              }}>
                {restVolume}%
              </Text>
            </View>
          </View>

          {/* Sound Alerts Section */}
          <View>
            <Text style={{ 
              fontSize: theme.fontSize.sm, 
              fontWeight: theme.fontWeight.semibold, 
              color: theme.text,
              marginBottom: theme.spacing.md,
            }}>
              Sound Alerts
            </Text>
            
            {/* Three sound options in a row */}
            <View style={{ 
              flexDirection: 'row', 
              gap: theme.spacing.sm,
            }}>
              {/* Before Start - with duration picker */}
              <CountdownPicker
                label="Before Start"
                value={countdownBeforeStartSec}
                onChange={onCountdownBeforeStartSecChange}
                sound={countdownBeforeStartSound}
                onSoundPress={() => onSoundPickerOpen('beforeStart')}
              />
              
              {/* End Work */}
              <SoundAlertCard
                label="End Work"
                sound={endWorkSound}
                onPress={() => onSoundPickerOpen('endWork')}
                onRemove={() => onSoundRemove('endWork')}
              />
              
              {/* End Rest */}
              <SoundAlertCard
                label="End Rest"
                sound={endRestSound}
                onPress={() => onSoundPickerOpen('endRest')}
                onRemove={() => onSoundRemove('endRest')}
              />
            </View>
          </View>
        </View>
      )}
    </View>
  );
};

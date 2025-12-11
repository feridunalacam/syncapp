import React from 'react';
import { View, Text, TouchableOpacity, Switch } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '../../../context/ThemeContext';

const COUNTDOWN_OPTIONS = [0, 3, 5, 10, 15, 20, 30];

/**
 * Countdown picker with duration selection (for Before Start)
 */
export const CountdownPicker = ({
  label,
  value,
  onChange,
  sound,
  onSoundPress,
}) => {
  const { theme } = useTheme();
  const isActive = value > 0;

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

      {/* Picker */}
      <Picker
        selectedValue={value}
        onValueChange={onChange}
        style={{ 
          width: '100%',
          height: 100,
          marginTop: -10,
          marginBottom: -10,
        }}
        itemStyle={{ 
          color: theme.text,
          fontSize: theme.fontSize.lg,
          fontWeight: theme.fontWeight.semibold,
          height: 100,
        }}
      >
        {COUNTDOWN_OPTIONS.map((sec) => (
          <Picker.Item key={sec} label={String(sec)} value={sec} />
        ))}
      </Picker>

      {/* Sound Button */}
      <TouchableOpacity
        onPress={onSoundPress}
        style={{
          backgroundColor: sound ? theme.accentLight : 'transparent',
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
          name="musical-note" 
          size={12} 
          color={sound ? theme.accent : theme.iconTertiary} 
        />
        <Text 
          style={{ 
            fontSize: theme.fontSize.xs, 
            color: sound ? theme.accent : theme.textTertiary,
          }} 
          numberOfLines={1}
        >
          {sound ? (sound.name?.substring(0, 6) || 'Sound') : 'Sound'}
        </Text>
      </TouchableOpacity>
    </View>
  );
};

/**
 * Sound toggle - simple on/off with sound selection
 * When toggled ON, opens sound picker. Sound plays at phase transition.
 */
export const SoundToggle = ({
  label,
  enabled,
  sound,
  onToggle, // Called when toggle is pressed - should open sound picker if turning ON
  onRemove, // Called to remove sound and disable
}) => {
  const { theme } = useTheme();
  const isActive = enabled && sound;

  const handlePress = () => {
    if (isActive) {
      // If already active, remove sound
      if (onRemove) onRemove();
    } else {
      // If not active, open sound picker
      if (onToggle) onToggle();
    }
  };

  return (
    <TouchableOpacity 
      onPress={handlePress}
      activeOpacity={0.7}
      style={{ 
        flex: 1,
        backgroundColor: isActive ? theme.accentLight : theme.cardSecondary,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: isActive ? theme.accent : theme.border,
        padding: theme.spacing.md,
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 80,
      }}
    >
      {/* Icon */}
      <View style={{
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: isActive ? theme.accent : theme.border,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: theme.spacing.xs,
      }}>
        <Ionicons 
          name={isActive ? "volume-high" : "volume-mute"} 
          size={16} 
          color={isActive ? '#fff' : theme.textTertiary} 
        />
      </View>

      {/* Label */}
      <Text style={{ 
        fontSize: theme.fontSize.xs, 
        color: isActive ? theme.accent : theme.textSecondary,
        fontWeight: theme.fontWeight.semibold,
        textAlign: 'center',
        marginBottom: theme.spacing.xs,
      }}>
        {label}
      </Text>

      {/* Sound name or OFF */}
      <Text 
        style={{ 
          fontSize: 10, 
          color: isActive ? theme.text : theme.textTertiary,
          textAlign: 'center',
        }} 
        numberOfLines={1}
      >
        {isActive ? (sound?.name?.substring(0, 10) || 'Sound') : 'OFF'}
      </Text>
    </TouchableOpacity>
  );
};

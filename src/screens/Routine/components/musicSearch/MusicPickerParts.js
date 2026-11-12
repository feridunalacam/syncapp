import Surface from '../../../../components/common/Surface';
import React from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  TextInput,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '../../../../context/ThemeContext';
import GlassSurface from '../../../../components/common/GlassSurface';
import MusicArtwork from '../../../../components/common/MusicArtwork';

export const Artwork = MusicArtwork;
export function PickerTabs({ items, value, onChange }) {
  const { theme } = useTheme();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 8, paddingVertical: 4 }}
      style={{ flexGrow: 0 }}
    >
      {items.map((item) => (
        <Pressable
          key={item.id}
          onPress={() => onChange(item.id)}
          accessibilityRole="tab"
          accessibilityState={{ selected: value === item.id }}
          accessibilityLabel={item.label}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 7,
            paddingHorizontal: 15,
            height: 42,
            borderRadius: 16,
            backgroundColor: value === item.id ? theme.accentLight : 'transparent',
          }}
        >
          {item.icon && (
            <Ionicons
              name={item.icon}
              size={16}
              color={value === item.id ? theme.accent : theme.textSecondary}
            />
          )}
          <Text
            style={{
              color: value === item.id ? theme.accent : theme.textSecondary,
              fontSize: 13,
              fontWeight: '600',
            }}
          >
            {item.label}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}
export function SearchField({
  value,
  onChange,
  placeholder = 'Search music',
  onSubmit,
  keyboardType,
  compact = false,
}) {
  const { theme } = useTheme();
  return (
    <Surface
      variant="inset"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: compact ? 6 : 10,
        paddingHorizontal: compact ? 10 : 14,
        height: compact ? 44 : 46,
        borderRadius: compact ? 12 : 16,
        backgroundColor: theme.cardSecondary,
        marginVertical: compact ? 0 : 12,
      }}
    >
      <Ionicons
        name={keyboardType === 'url' ? 'globe-outline' : 'search'}
        size={compact ? 16 : 18}
        color={theme.textSecondary}
      />
      <TextInput
        accessibilityLabel={placeholder}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={theme.textSecondary}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType={onSubmit ? 'go' : 'search'}
        onSubmitEditing={onSubmit}
        keyboardType={keyboardType}
        style={{ flex: 1, color: theme.text, fontSize: compact ? 12 : 14, paddingVertical: 10 }}
      />
      {value.length > 0 && (
        <Pressable onPress={() => onChange('')} accessibilityLabel="Clear search" hitSlop={10}>
          <Ionicons name="close-circle" size={compact ? 16 : 18} color={theme.textSecondary} />
        </Pressable>
      )}
    </Surface>
  );
}
export function MusicRow({
  item,
  onPress,
  selected = false,
  detail,
  actionIcon = 'add',
  disabled = false,
}) {
  const { theme } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || selected}
      accessibilityRole="button"
      accessibilityLabel={`${selected ? 'Selected' : 'Choose'} ${item.name || item.title || 'Audio'}`}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 12,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderColor: theme.border,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <Artwork
        item={item}
        icon={
          item.type === 'voice'
            ? 'volume-medium-outline'
            : item.type === 'playlist'
              ? 'albums-outline'
              : 'musical-note'
        }
      />
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={{ color: theme.text, fontSize: 14, fontWeight: '500' }}>
          {item.name || item.title || 'Audio'}
        </Text>
        <Text numberOfLines={1} style={{ color: theme.textSecondary, fontSize: 11, marginTop: 4 }}>
          {detail || item.artist || (item.type === 'playlist' ? 'Playlist' : 'Audio')}
        </Text>
      </View>
      <View
        style={{
          height: 32,
          width: 32,
          borderRadius: 16,
          backgroundColor: theme.accentLight,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons name={selected ? 'checkmark' : actionIcon} size={18} color={theme.accent} />
      </View>
    </Pressable>
  );
}
export function PickerState({ loading, error, title, onRetry, actionLabel = 'Try again' }) {
  const { theme } = useTheme();
  return (
    <View style={{ paddingVertical: 22, alignItems: 'center', gap: 12 }}>
      {loading ? (
        <ActivityIndicator color={theme.accent} />
      ) : (
        <Text
          style={{ color: theme.textSecondary, fontSize: 13, textAlign: 'center', lineHeight: 19 }}
        >
          {error || title}
        </Text>
      )}
      {!loading && onRetry && (
        <Pressable onPress={onRetry} accessibilityRole="button">
          <GlassSurface
            interactive
            style={{ paddingHorizontal: 18, paddingVertical: 12, borderRadius: 16 }}
          >
            <Text style={{ color: theme.accent, fontSize: 13, fontWeight: '600' }}>
              {actionLabel}
            </Text>
          </GlassSurface>
        </Pressable>
      )}
    </View>
  );
}
export function PrimaryAction({ label, onPress, disabled = false, loading = false, icon }) {
  const { theme } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      style={{
        backgroundColor: theme.accent,
        opacity: disabled ? 0.4 : 1,
        borderRadius: 17,
        minHeight: 48,
        padding: 14,
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
        gap: 9,
      }}
    >
      {loading ? (
        <ActivityIndicator color={theme.accentText} />
      ) : (
        icon && <Ionicons name={icon} size={18} color={theme.accentText} />
      )}
      <Text style={{ color: theme.accentText, fontSize: 14, fontWeight: '700' }}>{label}</Text>
    </Pressable>
  );
}

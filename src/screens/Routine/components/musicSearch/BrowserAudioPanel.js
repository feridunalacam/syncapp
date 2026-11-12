import React, { useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import * as Linking from 'expo-linking';
import { useTheme } from '../../../../context/ThemeContext';
import { WEB_MEDIA_IMPORT_AVAILABLE } from '../../../../services/mediaImport/config';
import { BOOKMARK_SITES } from './constants';
import { PrimaryAction } from './MusicPickerParts';

// Do not evaluate the legacy WebView/extractor module in a release build.
const LegacyBrowserAudioPanel = WEB_MEDIA_IMPORT_AVAILABLE
  ? require('./LegacyBrowserAudioPanel').default
  : null;

export default function BrowserAudioPanel({ picker }) {
  return LegacyBrowserAudioPanel ? (
    <LegacyBrowserAudioPanel picker={picker} />
  ) : (
    <FindAudioPanel picker={picker} />
  );
}

function FindAudioPanel({ picker }) {
  const { theme } = useTheme();
  const [error, setError] = useState(null);
  const [opening, setOpening] = useState(false);
  const lock = useRef(false);
  const open = async (site) => {
    if (lock.current) return;
    lock.current = true;
    setOpening(true);
    setError(null);
    try {
      await Linking.openURL(site.url);
    } catch {
      setError('This sound library could not be opened. Please try again.');
    } finally {
      lock.current = false;
      setOpening(false);
    }
  };
  return (
    <ScrollView contentContainerStyle={{ paddingTop: 12, paddingBottom: 20 }}>
      <Text style={{ color: theme.text, fontSize: 21, fontWeight: '600', marginBottom: 12 }}>
        Find audio
      </Text>
      <Text style={{ color: theme.textSecondary, fontSize: 13, lineHeight: 20, marginBottom: 16 }}>
        Open a sound library in your browser. Check the sound’s license, then import the file with
        Files.
      </Text>
      <View style={{ gap: 8, marginBottom: 20 }}>
        {BOOKMARK_SITES.map((site) => (
          <Pressable
            key={site.name}
            onPress={() => open(site)}
            disabled={opening}
            accessibilityRole="link"
            accessibilityLabel={`Open ${site.name}`}
            accessibilityState={{ disabled: opening }}
            style={{
              padding: 14,
              borderRadius: 13,
              backgroundColor: theme.cardSecondary,
              opacity: opening ? 0.5 : 1,
            }}
          >
            <Text style={{ color: theme.text }}>{site.name}</Text>
          </Pressable>
        ))}
      </View>
      <PrimaryAction
        label="Choose from Files"
        icon="folder-outline"
        onPress={picker.handlePickFile}
      />
      {!!error && (
        <Text
          accessibilityRole="alert"
          style={{ color: theme.textSecondary, fontSize: 12, marginTop: 12 }}
        >
          {error}
        </Text>
      )}
    </ScrollView>
  );
}

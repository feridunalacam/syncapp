import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Image, PixelRatio, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '../../context/ThemeContext';
import { musicArtworkUrls } from '../../domain/musicArtwork';

function ArtworkImage({ urls, size, onUnavailable }) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (!urls[index]) onUnavailable();
  }, [index, urls, onUnavailable]);
  if (!urls[index]) return null;
  return (
    <Image
      key={urls[index]}
      source={{ uri: urls[index] }}
      style={[StyleSheet.absoluteFillObject, { width: size, height: size }]}
      resizeMode="cover"
      onError={() => setIndex((current) => (current === index ? current + 1 : current))}
    />
  );
}

export default function MusicArtwork({
  item,
  fallbackItem,
  size = 44,
  icon = 'musical-note',
  iconColor,
  onUnavailable,
}) {
  const { theme } = useTheme();
  const pixels = size * PixelRatio.get();
  const urls = [
    ...new Set([...musicArtworkUrls(item, pixels), ...musicArtworkUrls(fallbackItem, pixels)]),
  ];
  const candidates = urls.join('\n');
  const reported = useRef({ candidates, notified: false });
  if (reported.current.candidates !== candidates)
    reported.current = { candidates, notified: false };
  const unavailable = useCallback(() => {
    if (
      typeof onUnavailable !== 'function' ||
      reported.current.candidates !== candidates ||
      reported.current.notified
    )
      return;
    reported.current.notified = true;
    onUnavailable();
  }, [candidates, onUnavailable]);
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: Math.min(18, size / 4),
        overflow: 'hidden',
        backgroundColor: theme.cardSecondary,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Ionicons name={icon} size={Math.min(30, size / 2)} color={iconColor || theme.accent} />
      <ArtworkImage key={candidates} urls={urls} size={size} onUnavailable={unavailable} />
    </View>
  );
}

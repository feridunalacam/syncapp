import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { useTheme } from '../../../context/ThemeContext';

const clamp = (value) => Math.max(0, Math.min(1, value));

// Animate between player samples on the native thread. Prediction stops after
// 1.5 seconds without another sample, so a stalled player cannot drift forever.
export default function PlaybackProgress({ position, duration, playing, playbackKey }) {
  const { theme } = useTheme();
  const [width, setWidth] = useState(0);
  const progress = useRef(new Animated.Value(clamp(position / duration))).current;
  const previousKey = useRef(playbackKey);
  useEffect(() => {
    let cancelled = false;
    let animation;
    const changedTrack = previousKey.current !== playbackKey;
    previousKey.current = playbackKey;
    progress.stopAnimation((current) => {
      if (cancelled) return;
      const reported = clamp(position / duration);
      // A seek, loop, or track change must not be animated across the whole song.
      const jump = changedTrack || Math.abs(current - reported) * duration > 2;
      const start = jump ? reported : clamp(current);
      if (jump) progress.setValue(start);
      if (!playing || !width || duration <= 0) return;
      const target = clamp((position + 1.5) / duration);
      if (target <= start) return;
      animation = Animated.timing(progress, {
        toValue: target,
        duration: (target - start) * duration * 1000,
        easing: Easing.linear,
        useNativeDriver: true,
      });
      animation.start();
    });
    return () => {
      cancelled = true;
      animation?.stop();
    };
  }, [position, duration, playing, playbackKey, width, progress]);
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel="Music playback progress"
      accessibilityValue={{
        min: 0,
        max: Math.round(duration),
        now: Math.min(Math.round(duration), Math.max(0, Math.round(position))),
      }}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      style={[styles.track, { backgroundColor: theme.border }]}
    >
      <Animated.View
        style={[
          styles.fill,
          {
            width,
            backgroundColor: theme.accent,
            transform: [
              {
                translateX: progress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-width, 0],
                  extrapolate: 'clamp',
                }),
              },
            ],
          },
        ]}
      />
    </View>
  );
}
const styles = StyleSheet.create({
  track: { height: 3, borderRadius: 2, marginTop: 9, overflow: 'hidden' },
  fill: { width: '100%', height: 3, borderRadius: 2 },
});

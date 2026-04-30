import React from 'react';
import { View, TouchableOpacity } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

// Reusable wrapper that enforces a11y props on every transport-control button.
// `label` becomes the screen-reader announcement; `state` (selected) is used
// for toggle-style controls so VoiceOver/TalkBack reads "selected" correctly.
const ControlButton = ({ style, onPress, label, selected, children }) => (
  <TouchableOpacity
    style={style}
    onPress={onPress}
    accessibilityRole="button"
    accessibilityLabel={label}
    accessibilityState={selected != null ? { selected } : undefined}
  >
    {children}
  </TouchableOpacity>
);

export const AudioControllerUI = ({
  screenStyles,
  theme,
  isShuffled,
  isWorkoutRunning,
  isPaused,
  isRepeating,
  onSkipBackward,
  onToggleShuffle,
  onSkipPrevious,
  onPauseResume,
  onStop,
  onSkipNext,
  onToggleRepeat,
  onSkipForward,
}) => {
  const isPlaying = isWorkoutRunning && !isPaused;
  return (
    <View style={{ height: 96, marginTop: 0, marginBottom: 8, justifyContent: 'center' }}>
      <View style={[screenStyles.workoutControlBar, { marginTop: 0, marginBottom: 0 }]}>
        <ControlButton
          style={screenStyles.controlButtonSide}
          onPress={onSkipBackward}
          label="Skip to previous round"
        >
          <Ionicons name="chevron-back" size={25} color={theme.iconSecondary} />
        </ControlButton>
        <ControlButton
          style={screenStyles.controlButton}
          onPress={onToggleShuffle}
          label={isShuffled ? 'Disable shuffle' : 'Enable shuffle'}
          selected={isShuffled}
        >
          <View style={{ alignItems: 'center' }}>
            <Ionicons
              name="shuffle"
              size={25}
              color={isShuffled ? theme.iconPrimary : theme.iconSecondary}
              style={{ opacity: isShuffled ? 1 : 0.5 }}
            />
            <View
              style={{
                width: 4,
                height: 4,
                borderRadius: 2,
                marginTop: 4,
                backgroundColor: isShuffled ? theme.iconPrimary : theme.iconSecondary,
                opacity: isShuffled ? 1 : 0.5,
              }}
            />
          </View>
        </ControlButton>
        <ControlButton
          style={screenStyles.controlButton}
          onPress={onSkipPrevious}
          label="Previous track"
        >
          <Ionicons name="play-skip-back" size={25} color={theme.iconSecondary} />
        </ControlButton>
        <ControlButton
          style={[screenStyles.controlButton, screenStyles.controlButtonPrimary]}
          onPress={onPauseResume}
          label={isPlaying ? 'Pause workout' : 'Start or resume workout'}
        >
          <Ionicons
            name={isPlaying ? 'pause' : 'play'}
            size={30}
            color={theme.iconPrimary}
          />
        </ControlButton>
        <ControlButton
          style={screenStyles.controlButtonReset}
          onPress={onStop}
          label="Stop workout"
        >
          <Ionicons name="square" size={25} color={theme.iconSecondary} />
        </ControlButton>
        <ControlButton
          style={screenStyles.controlButton}
          onPress={onSkipNext}
          label="Next track"
        >
          <Ionicons name="play-skip-forward" size={25} color={theme.iconSecondary} />
        </ControlButton>
        <ControlButton
          style={screenStyles.controlButton}
          onPress={onToggleRepeat}
          label={isRepeating ? 'Disable repeat' : 'Enable repeat'}
          selected={isRepeating}
        >
          <View style={{ alignItems: 'center' }}>
            <Ionicons
              name={isRepeating ? 'repeat' : 'repeat-outline'}
              size={25}
              color={isRepeating ? theme.iconPrimary : theme.iconSecondary}
              style={{ opacity: isRepeating ? 1 : 0.5 }}
            />
            <View
              style={{
                width: 4,
                height: 4,
                borderRadius: 2,
                marginTop: 4,
                backgroundColor: isRepeating ? theme.iconPrimary : theme.iconSecondary,
                opacity: isRepeating ? 1 : 0.5,
              }}
            />
          </View>
        </ControlButton>
        <ControlButton
          style={screenStyles.controlButtonSide}
          onPress={onSkipForward}
          label="Skip to next round"
        >
          <Ionicons name="chevron-forward" size={25} color={theme.iconSecondary} />
        </ControlButton>
      </View>
    </View>
  );
};

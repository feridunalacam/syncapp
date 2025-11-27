import React from 'react';
import { View, TouchableOpacity } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

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
}) => (
  <View style={{ height: 96, marginTop: 0, marginBottom: 8, justifyContent: 'center' }}>
    <View style={[screenStyles.workoutControlBar, { marginTop: 0, marginBottom: 0 }]}>
      <TouchableOpacity style={screenStyles.controlButtonSide} onPress={onSkipBackward}>
        <Ionicons name="chevron-back" size={25} color={theme.iconSecondary} />
      </TouchableOpacity>
      <TouchableOpacity style={screenStyles.controlButton} onPress={onToggleShuffle}>
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
      </TouchableOpacity>
      <TouchableOpacity style={screenStyles.controlButton} onPress={onSkipPrevious}>
        <Ionicons name="play-skip-back" size={25} color={theme.iconSecondary} />
      </TouchableOpacity>
      <TouchableOpacity
        style={[screenStyles.controlButton, screenStyles.controlButtonPrimary]}
        onPress={onPauseResume}
      >
        <Ionicons
          name={!isWorkoutRunning || isPaused ? 'play' : 'pause'}
          size={30}
          color={theme.iconPrimary}
        />
      </TouchableOpacity>
      <TouchableOpacity style={screenStyles.controlButtonReset} onPress={onStop}>
        <Ionicons name="square" size={25} color={theme.iconSecondary} />
      </TouchableOpacity>
      <TouchableOpacity style={screenStyles.controlButton} onPress={onSkipNext}>
        <Ionicons name="play-skip-forward" size={25} color={theme.iconSecondary} />
      </TouchableOpacity>
      <TouchableOpacity style={screenStyles.controlButton} onPress={onToggleRepeat}>
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
      </TouchableOpacity>
      <TouchableOpacity style={screenStyles.controlButtonSide} onPress={onSkipForward}>
        <Ionicons name="chevron-forward" size={25} color={theme.iconSecondary} />
      </TouchableOpacity>
    </View>
  </View>
);



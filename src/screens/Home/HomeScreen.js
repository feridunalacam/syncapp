import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Alert } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useRoutineContext } from '../../context/RoutineContext';
import { usePlatformContext } from '../../context/PlatformContext';
import { useTheme } from '../../context/ThemeContext';
import { createScreenStyles } from '../../styles/screenStyles';
import ScreenWrapper from '../../components/common/ScreenWrapper';
import { useTimerLogic } from './TimerLogic';
import { useAudioController } from '../../hooks/useAudioController';
import { useCountdownSoundPlayer } from '../../utils/countdownSoundPlayer';
import { navigateToCreateRoutine } from '../../navigation/navigationHelpers';
import { MusicPlayerPreview } from './components/MusicPlayerPreview';
import { AudioControllerUI } from './components/AudioControllerUI';
import { TimerDesign } from './components/TimerDesign';

const DEFAULT_ROUTINE_KEY = 'deneme';

function HomeScreen({ navigation }) {
  const { routines, addCompletedRoutine } = useRoutineContext();
  const { theme } = useTheme();
  const screenStyles = createScreenStyles({ ...theme, isDark: theme.background === '#000000' });
  
  const { 
    selectedPlatform, 
    connectedPlatforms, 
    refreshToken,
    musicPlayer,
    services
  } = usePlatformContext();
  
  const [selectedRoutineId, setSelectedRoutineId] = useState(DEFAULT_ROUTINE_KEY);
  const [isWorkoutRunning, setIsWorkoutRunning] = useState(false);
  const [showRoutineDropdown, setShowRoutineDropdown] = useState(false);

  const selectedRoutine = useMemo(
    () => routines.find((routine) => routine.id === selectedRoutineId) ?? null,
    [routines, selectedRoutineId],
  );

  // Countdown sound player
  const countdownSoundPlayer = useCountdownSoundPlayer();

  // Audio Controller Hook - Manages all music playback
  // All music controls (play, pause, shuffle, next, previous, repeat) are handled here
  // Phase changes automatically trigger music changes
  const {
      accessToken,
      track,
      isMusicPlaying,
      musicProgress,
      isShuffled,
      isRepeating,
      handlePhaseChange,
      togglePlayPause,
      pauseMusic,
      resumeMusic,
      skipNext,
      skipPrevious,
      toggleShuffle,
      toggleRepeat,
      stopMusic,
      setVolume,
      applyRestVolume,
      resetVolume,
      playCountdownSound,
      fetchPlayback,
  } = useAudioController({
      musicPlayer,
      selectedPlatform,
      connectedPlatforms,
      refreshToken,
      selectedRoutine,
      services,
      countdownSoundPlayer,
  });

  // Handler for workout completion
  const handleWorkoutComplete = useCallback(async () => {
      console.log('🏁 handleWorkoutComplete called - routine finished!');
      setIsWorkoutRunning(false);
      console.log('🏁 Calling stopMusic...');
      await stopMusic();
      console.log('🏁 stopMusic completed, adding completed routine...');
      addCompletedRoutine({
        ...selectedRoutine,
        completedAt: new Date().toISOString(),
      });
      console.log('🏁 handleWorkoutComplete done');
  }, [selectedRoutine, addCompletedRoutine, stopMusic]);

  // Handle countdown start - play music for beforeStart phase (like a round)
  const handleCountdownStart = useCallback(async (countdownType, duration) => {
    console.log(`Countdown started: ${countdownType}, duration: ${duration}s`);
    
    if (countdownType === 'beforeStart' && duration > 0) {
      // Treat beforeStart like a round - use handlePhaseChange to play music
      console.log('🎵 Starting beforeStart music via handlePhaseChange');
      await handlePhaseChange('beforeStart', 0);
    }
  }, [handlePhaseChange]);

  // Track which sounds have been played this phase (to avoid replaying)
  const [playedSoundsThisPhase, setPlayedSoundsThisPhase] = useState({
    beforeStart: false,
    endWork: false,
    endRest: false,
  });

  // Handle phase change with volume control (sounds are now triggered by time-based useEffect)
  const handlePhaseChangeWithVolume = useCallback(async (phase, round) => {
    console.log('📍 handlePhaseChangeWithVolume:', phase, round);
    
    // Reset played sounds flags when phase changes
    setPlayedSoundsThisPhase({ beforeStart: false, endWork: false, endRest: false });
    
    if (phase === 'work') {
      // Work phase starting
      if (round === 1) {
        console.log('📍 Round 1 work starting - initializing music');
      }
      // Notify audio controller about phase changes
      await handlePhaseChange(phase, round);
      // Reset volume to 100%
      await resetVolume();
    } else if (phase === 'rest') {
      // Apply rest volume
      if (selectedRoutine?.restVolume !== undefined && selectedRoutine.restVolume < 100) {
        console.log('📍 Applying rest volume:', selectedRoutine.restVolume);
        await applyRestVolume(selectedRoutine.restVolume);
      }
      // Notify audio controller about phase changes so music can sync
      await handlePhaseChange(phase, round);
    } else {
      // Other phases (beforeStart, etc.)
      await handlePhaseChange(phase, round);
    }
  }, [handlePhaseChange, applyRestVolume, resetVolume, selectedRoutine]);

  const {
    timeRemaining,
    currentPhase,
    currentRound,
    isActive: isTimerActive,
    isPaused,
    isCountdownPhase,
    start: startTimer,
    pause: pauseTimer,
    resume: resumeTimer,
    stop: stopTimer,
    skipPhase,
    setPhase,
  } = useTimerLogic({
    workSec: selectedRoutine ? (selectedRoutine.workSec || 60) : 60,
    restSec: selectedRoutine ? (selectedRoutine.restSec || 30) : 30,
    rounds: selectedRoutine ? (selectedRoutine.rounds || 5) : 5,
    // Only beforeStart has a countdown - other sounds play at phase transitions
    countdownBeforeStartSec: selectedRoutine?.countdownBeforeStartDuration || 0,
    onPhaseChange: handlePhaseChangeWithVolume,
    onCountdownStart: handleCountdownStart,
    onComplete: handleWorkoutComplete,
  });

  // Time-based sound triggers: Play sounds X seconds before phase ends (X = sound duration)
  useEffect(() => {
    if (!isWorkoutRunning || isPaused || !selectedRoutine) return;

    // Helper to get sound duration in seconds
    const getSoundDurationSec = (sound) => {
      if (!sound || !sound.duration) return 0;
      // Duration is already in seconds (from MusicSearchModal DEFAULT_VOICES)
      return sound.duration;
    };

    // Before Start phase - play countdownBeforeStartSound
    if (currentPhase === 'beforeStart' && !playedSoundsThisPhase.beforeStart) {
      const soundDurationSec = getSoundDurationSec(selectedRoutine.countdownBeforeStartSound);
      if (soundDurationSec > 0 && timeRemaining === soundDurationSec) {
        console.log(`🔔 Before Start: ${timeRemaining}s remaining, playing sound (duration: ${soundDurationSec}s)`);
        playCountdownSound('beforeStart');
        setPlayedSoundsThisPhase(prev => ({ ...prev, beforeStart: true }));
      }
    }

    // Work phase - play endWorkSound before work ends
    if (currentPhase === 'work' && !playedSoundsThisPhase.endWork) {
      const soundDurationSec = getSoundDurationSec(selectedRoutine.endWorkSound);
      if (soundDurationSec > 0 && timeRemaining === soundDurationSec) {
        console.log(`🔔 Work phase: ${timeRemaining}s remaining, playing endWorkSound (duration: ${soundDurationSec}s)`);
        playCountdownSound('endWork');
        setPlayedSoundsThisPhase(prev => ({ ...prev, endWork: true }));
      }
    }

    // Rest phase - play endRestSound before rest ends
    if (currentPhase === 'rest' && !playedSoundsThisPhase.endRest) {
      const soundDurationSec = getSoundDurationSec(selectedRoutine.endRestSound);
      if (soundDurationSec > 0 && timeRemaining === soundDurationSec) {
        console.log(`🔔 Rest phase: ${timeRemaining}s remaining, playing endRestSound (duration: ${soundDurationSec}s)`);
        playCountdownSound('endRest');
        setPlayedSoundsThisPhase(prev => ({ ...prev, endRest: true }));
      }
    }
  }, [timeRemaining, currentPhase, isWorkoutRunning, isPaused, selectedRoutine, playedSoundsThisPhase, playCountdownSound]);

  // Sync playback status with API periodically (every 2 seconds)
  useEffect(() => {
    if (!selectedPlatform || !isWorkoutRunning || !musicPlayer) return;
    
    const hasBeforeStartCountdown = (selectedRoutine?.countdownBeforeStartDuration || 0) > 0;
    if (isCountdownPhase || currentPhase === 'beforeStart') return;
    
    // Also skip if workout just started and has countdown (race condition protection)
    // Only fetch after first real phase (work/rest) has started
    if (hasBeforeStartCountdown && currentPhase === 'work' && currentRound === 1) {
      // Wait a bit to let the phase settle
      const timeout = setTimeout(() => {
        if (!isCountdownPhase && currentPhase !== 'beforeStart') {
          fetchPlayback();
        }
      }, 1000);
      return () => clearTimeout(timeout);
    }
    
    // Fetch immediately when work/rest starts (no countdown case)
    if (!hasBeforeStartCountdown) {
      fetchPlayback();
    }
    
    const interval = setInterval(async () => {
      // Double check we're not in countdown
      if (!isCountdownPhase && currentPhase !== 'beforeStart') {
        await fetchPlayback();
      }
    }, 1000); // Sync every 1 second for smoother progress
    
    return () => clearInterval(interval);
  }, [selectedPlatform, isWorkoutRunning, musicPlayer, fetchPlayback, isCountdownPhase, currentPhase, currentRound, selectedRoutine]);

  // Reset timer when routine changes (if not running)
  useEffect(() => {
    if (!isWorkoutRunning && selectedRoutine) {
      setPhase('work', 1);
    }
  }, [selectedRoutineId, isWorkoutRunning, selectedRoutine, setPhase]);

  // Workout Handlers
  const startWorkoutFlow = useCallback(async () => {
    if (!selectedRoutine) {
      Alert.alert('No Routine Selected', 'Please choose a routine before starting.');
      return false;
    }
    if (isWorkoutRunning || isTimerActive) {
      return false;
    }

    // Preload countdown sounds for instant playback
    const soundsToPreload = [];
    if (selectedRoutine.countdownBeforeStartSound?.uri) {
      soundsToPreload.push(selectedRoutine.countdownBeforeStartSound.uri);
    }
    if (selectedRoutine.endWorkSound?.uri) {
      soundsToPreload.push(selectedRoutine.endWorkSound.uri);
    }
    if (selectedRoutine.endRestSound?.uri) {
      soundsToPreload.push(selectedRoutine.endRestSound.uri);
    }
    if (soundsToPreload.length > 0) {
      countdownSoundPlayer.preload(soundsToPreload);
    }

    // Debug: Log routine settings
    console.log('🚀 Starting workout with routine:', selectedRoutine.name);
    console.log('🚀 Routine settings:', {
      restVolume: selectedRoutine.restVolume,
      countdownBeforeStartDuration: selectedRoutine.countdownBeforeStartDuration,
      countdownBeforeStartSound: selectedRoutine.countdownBeforeStartSound,
      countdownEndWorkDuration: selectedRoutine.countdownEndWorkDuration,
      countdownEndWorkSound: selectedRoutine.countdownEndWorkSound,
      countdownEndRestDuration: selectedRoutine.countdownEndRestDuration,
      countdownEndRestSound: selectedRoutine.countdownEndRestSound,
    });

    setPhase('work', 1);
    setIsWorkoutRunning(true);
    startTimer();

    // Check if we have a beforeStart countdown
    const hasBeforeStartCountdown = (selectedRoutine?.countdownBeforeStartDuration || 0) > 0;
    console.log('🚀 hasBeforeStartCountdown:', hasBeforeStartCountdown);
    
    // Only start music immediately if there's no countdown
    // Otherwise, music will start when countdown ends and work phase begins
    if (!hasBeforeStartCountdown) {
      console.log('🚀 No countdown, starting music immediately');
      await handlePhaseChange('work', 1);
    } else {
      console.log('🚀 Has countdown, music will start after countdown');
    }

    return true;
  }, [
    isTimerActive,
    isWorkoutRunning,
    selectedRoutine,
    setPhase,
    startTimer,
    handlePhaseChange,
  ]);

  const handlePauseResume = useCallback(async () => {
    if (!selectedRoutine) {
      Alert.alert('No Routine Selected', 'Please choose a routine before starting.');
      return;
    }

    if (!isWorkoutRunning) {
      await startWorkoutFlow();
      return;
    }

    if (isPaused) {
      resumeTimer();
      await resumeMusic();
    } else {
      pauseTimer();
      await pauseMusic();
    }
  }, [
    isPaused,
    isWorkoutRunning,
    pauseTimer,
    resumeTimer,
    selectedRoutine,
    startWorkoutFlow,
    pauseMusic,
    resumeMusic,
  ]);

  const handleStopWorkout = useCallback(async () => {
    console.log('⏹️ handleStopWorkout called - stop button pressed!');
    stopTimer();
    setPhase('work', 1);
    setIsWorkoutRunning(false);
    console.log('⏹️ Calling stopMusic...');
    await stopMusic();
    console.log('⏹️ handleStopWorkout done');
  }, [stopTimer, setPhase, stopMusic]);

  const handleSkipBackward = useCallback(() => {
    if (!selectedRoutine || !isWorkoutRunning) return;
    let targetPhase = currentPhase;
    let targetRound = currentRound;
    
    if (currentPhase === 'rest') {
        targetPhase = 'work';
    } else if (currentRound > 1) {
        targetRound = currentRound - 1;
        targetPhase = 'rest';
    }

    if (targetPhase !== currentPhase || targetRound !== currentRound) {
         setPhase(targetPhase, targetRound);
         // Notify audio controller about manual phase change
         handlePhaseChange(targetPhase, targetRound);
    }
  }, [selectedRoutine, isWorkoutRunning, currentPhase, currentRound, setPhase, handlePhaseChange]);

  const handleSkipForward = useCallback(() => {
    if (!selectedRoutine || !isWorkoutRunning) return;
    skipPhase();
    // Note: skipPhase will trigger onPhaseChange callback which notifies audio controller
  }, [selectedRoutine, isWorkoutRunning, skipPhase]);

  return (
    <ScreenWrapper style={screenStyles.container} backgroundColor={theme.background}>
    <View style={screenStyles.flexContainer}>
      {/* Header - Same structure as Routine screen */}
      <View style={screenStyles.pageHeader}>
        <View style={[screenStyles.pageHeaderContent, { marginBottom: theme.spacing.sm }]}>
          <View style={screenStyles.routineSelectorBar}>
            <TouchableOpacity style={screenStyles.routineSelectorTextContainer} onPress={() => setShowRoutineDropdown(!showRoutineDropdown)} activeOpacity={0.7}>
            <Text style={screenStyles.routineSelectorTitle} numberOfLines={1}>
              {selectedRoutine ? selectedRoutine.name : 'No routine selected'}
            </Text>
            {selectedRoutine && (
              <TouchableOpacity 
                onPress={(e) => {
                  e.stopPropagation();
                  navigateToCreateRoutine(navigation, selectedRoutine);
                }}
                style={screenStyles.routineSelectorEditIcon}
                activeOpacity={0.7}
              >
                <Ionicons name="create-outline" size={18} color={theme.accent} />
              </TouchableOpacity>
            )}
            <Ionicons name="chevron-down" size={20} color={theme.accent} />
          </TouchableOpacity>
          {showRoutineDropdown && (
            <>
              <TouchableOpacity style={screenStyles.dropdownOverlay} onPress={() => setShowRoutineDropdown(false)} activeOpacity={1} />
              <View style={screenStyles.routineDropdownMenu} pointerEvents="box-none">
                <View pointerEvents="auto">
                <ScrollView>
                  <TouchableOpacity style={[screenStyles.routineDropdownItem, routines.length === 0 && screenStyles.routineDropdownItemLast]} onPress={() => { setSelectedRoutineId(null); setShowRoutineDropdown(false); if (isWorkoutRunning) handleStopWorkout(); }} activeOpacity={0.7}>
                    <Text style={[screenStyles.routineDropdownItemText, !selectedRoutineId && screenStyles.routineDropdownItemTextSelected]}>No routine selected</Text>
                  </TouchableOpacity>
                  {routines.map((routine, index) => (
                    <TouchableOpacity key={routine.id} style={[screenStyles.routineDropdownItem, index === routines.length - 1 && screenStyles.routineDropdownItemLast]} onPress={() => { setSelectedRoutineId(routine.id); setShowRoutineDropdown(false); if (isWorkoutRunning) handleStopWorkout(); }} activeOpacity={0.7}>
                      <Text style={[screenStyles.routineDropdownItemText, routine.id === selectedRoutineId && screenStyles.routineDropdownItemTextSelected]}>{routine.name}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                </View>
              </View>
              </>
            )}
          </View>
          <TouchableOpacity style={screenStyles.addButton} onPress={() => navigateToCreateRoutine(navigation)}>
            <Text style={screenStyles.addButtonText}>+</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView style={screenStyles.contentContainer} contentContainerStyle={{ flexGrow: 1, paddingHorizontal: theme.spacing.xl, paddingTop: theme.spacing['2xl'], paddingBottom: theme.spacing['4xl'] }} showsVerticalScrollIndicator={false}>
      
      {/* Timer Circle */}
      <TimerDesign
        isWorkoutRunning={isWorkoutRunning}
        isPaused={isPaused}
        timeRemaining={timeRemaining}
        currentPhase={currentPhase}
        currentRound={currentRound}
        selectedRoutine={selectedRoutine}
        isCountdownActive={isCountdownPhase}
        countdownTime={isCountdownPhase ? timeRemaining : null}
      />

      <View style={screenStyles.divider} />

        <AudioControllerUI
          screenStyles={screenStyles}
          theme={theme}
          isShuffled={isShuffled}
          isWorkoutRunning={isWorkoutRunning}
          isPaused={isPaused}
          isRepeating={isRepeating}
          onSkipBackward={handleSkipBackward}
          onToggleShuffle={toggleShuffle}
          onSkipPrevious={skipPrevious}
          onPauseResume={handlePauseResume}
          onStop={handleStopWorkout}
          onSkipNext={skipNext}
          onToggleRepeat={toggleRepeat}
          onSkipForward={handleSkipForward}
        />

        {/* Player UI - Shows what's playing from routine or background */}
        <MusicPlayerPreview 
          track={track}
          musicProgress={musicProgress}
          selectedRoutine={selectedRoutine}
          currentRound={currentRound}
          currentPhase={currentPhase}
          isWorkoutRunning={isWorkoutRunning}
          isPaused={isPaused}
        />
      </ScrollView>
              </View>
    </ScreenWrapper>
  );
}

export default HomeScreen;

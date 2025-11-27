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
      pauseMusic, // ✅ NEW: Explicit pause
      resumeMusic, // ✅ NEW: Explicit resume
      skipNext,
      skipPrevious,
      toggleShuffle,
      toggleRepeat,
      stopMusic, // ✅ NEW: Complete music stop
      setVolume, // ✅ NEW: Volume control
      fetchPlayback,
  } = useAudioController({
      musicPlayer,
      selectedPlatform,
      connectedPlatforms,
      refreshToken,
      selectedRoutine,
      services
  });

  // Handler for workout completion
  const handleWorkoutComplete = useCallback(async () => {
      setIsWorkoutRunning(false);
      await stopMusic();
      addCompletedRoutine({
        ...selectedRoutine,
        completedAt: new Date().toISOString(),
      });
  }, [selectedRoutine, addCompletedRoutine, stopMusic]);

  const {
    timeRemaining,
    currentPhase,
    currentRound,
    isActive: isTimerActive,
    isPaused,
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
    onPhaseChange: (phase, round) => {
       // Notify audio controller about phase changes so music can sync
       handlePhaseChange(phase, round);
    },
    onComplete: handleWorkoutComplete,
  });

  // Sync playback status with API periodically (every 2 seconds)
  // This keeps track info and progress bar updated
  useEffect(() => {
    if (!selectedPlatform || !isWorkoutRunning || !musicPlayer) return;
    
    // Fetch immediately when workout starts
    fetchPlayback();
    
    const interval = setInterval(async () => {
      await fetchPlayback();
    }, 2000); // Sync every 2 seconds
    
    return () => clearInterval(interval);
  }, [selectedPlatform, isWorkoutRunning, musicPlayer, fetchPlayback]);

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

    setPhase('work', 1);
    setIsWorkoutRunning(true);
    startTimer();

    // Start music playback for first phase
    await handlePhaseChange('work', 1);

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
    stopTimer();
    setPhase('work', 1);
    setIsWorkoutRunning(false);
    await stopMusic();
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
    <View style={{ flex: 1 }}>
      {/* Top Bar */}
      <View style={screenStyles.topBar}>
        <View style={{ flexDirection: 'row', alignItems: 'center', position: 'relative' }}>
          <View style={screenStyles.routineSelectorBar}>
            <View style={screenStyles.routineDropdownButton}>
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
                  style={{ marginLeft: theme.spacing.sm, marginRight: theme.spacing.xs }}
                  activeOpacity={0.7}
                >
                  <Ionicons name="create-outline" size={18} color={theme.accent} />
                </TouchableOpacity>
              )}
                <Ionicons name="chevron-down" size={20} color={theme.accent} />
            </TouchableOpacity>
              <View style={screenStyles.routineSelectorActions}>
                <TouchableOpacity style={screenStyles.routineSelectorActionButton} onPress={() => navigateToCreateRoutine(navigation)} activeOpacity={0.7}>
                  <Ionicons name="add" size={20} color={theme.accent} />
          </TouchableOpacity>
              </View>
            </View>
          </View>
          {showRoutineDropdown && (
            <>
              <TouchableOpacity style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 999 }} onPress={() => setShowRoutineDropdown(false)} activeOpacity={1} />
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
      />

      <View style={{ width: '100%', height: 1, backgroundColor: theme.divider, marginTop: theme.spacing['2xl'], marginBottom: theme.spacing.sm }} />

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
          timeRemaining={timeRemaining}
        />
      </ScrollView>
              </View>
    </ScreenWrapper>
  );
}

export default HomeScreen;

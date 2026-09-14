import { useCallback, useRef, useState } from 'react';
import { Alert, AppState } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useWorkout } from '../context/WorkoutContext';
import { previewWorkoutCue, stopCuePreview, prepareWorkoutCues } from '../services/alerts/player';

export default function useAlertPreview() {
  const { isWorkoutRunning } = useWorkout();
  const [previewing, setPreviewing] = useState(null);
  const revision = useRef(0);
  const focused = useRef(false);
  const stopPreview = useCallback(() => {
    revision.current++;
    setPreviewing(null);
    return stopCuePreview();
  }, []);
  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      prepareWorkoutCues().catch(() => {});
      const subscription = AppState.addEventListener('change', (state) => {
        if (state !== 'active') stopPreview();
      });
      return () => {
        focused.current = false;
        revision.current++;
        subscription.remove();
        stopCuePreview();
      };
    }, [stopPreview]),
  );
  const previewCue = useCallback(
    async (key, config) => {
      if (isWorkoutRunning) {
        Alert.alert('Finish the session first', 'Preview cues when no workout is running.');
        return;
      }
      const version = ++revision.current;
      setPreviewing(key);
      try {
        await previewWorkoutCue(key, config);
      } catch (error) {
        if (focused.current && version === revision.current)
          Alert.alert('Could not preview cue', error.message || 'Try a built-in sound.');
      } finally {
        if (focused.current && version === revision.current) setPreviewing(null);
      }
    },
    [isWorkoutRunning],
  );
  return { previewCue, stopPreview, previewing };
}

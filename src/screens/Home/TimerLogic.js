import { useState, useEffect, useRef, useCallback } from 'react';

export const useTimerLogic = ({
  workSec = 60,
  restSec = 30,
  rounds = 5,
  onPhaseChange,
  onComplete,
}) => {
  const [timeRemaining, setTimeRemaining] = useState(workSec);
  const [currentPhase, setCurrentPhase] = useState('work');
  const [currentRound, setCurrentRound] = useState(1);
  const [isActive, setIsActive] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  // Refs to avoid closure staleness in the RAF loop
  const stateRef = useRef({
    isActive: false,
    isPaused: false,
    phase: 'work',
    round: 1,
    endTime: 0,
    remaining: workSec,
    workSec,
    restSec,
    rounds,
  });

  // Update refs when props/state change
  useEffect(() => {
    stateRef.current.workSec = workSec;
    stateRef.current.restSec = restSec;
    stateRef.current.rounds = rounds;
    stateRef.current.phase = currentPhase;
    stateRef.current.round = currentRound;
    stateRef.current.isActive = isActive;
    stateRef.current.isPaused = isPaused;
  }, [workSec, restSec, rounds, currentPhase, currentRound, isActive, isPaused]);

  const getDuration = useCallback((phase) => {
    return phase === 'work' ? stateRef.current.workSec : stateRef.current.restSec;
  }, []);

  const stop = useCallback(() => {
    setIsActive(false);
    setIsPaused(false);
    const initialDuration = getDuration('work');
    setTimeRemaining(initialDuration);
    setCurrentPhase('work');
    setCurrentRound(1);
    
    stateRef.current.isActive = false;
    stateRef.current.isPaused = false;
    stateRef.current.phase = 'work';
    stateRef.current.round = 1;
    stateRef.current.endTime = 0;
  }, [getDuration]);

  const start = useCallback(() => {
    if (stateRef.current.isActive && !stateRef.current.isPaused) return;

    const now = Date.now();
    
    if (stateRef.current.isPaused && stateRef.current.endTime > 0) {
      // Resume: recalculate endTime based on stored remaining time
      // We don't store "pausedAt", we store "remaining" when pausing.
      stateRef.current.endTime = now + (stateRef.current.remaining * 1000);
    } else {
      // Start fresh
      const duration = getDuration(stateRef.current.phase);
      stateRef.current.endTime = now + (duration * 1000);
      // Update state if needed (e.g. if we were reset)
    }

    setIsActive(true);
    setIsPaused(false);
    stateRef.current.isActive = true;
    stateRef.current.isPaused = false;
  }, [getDuration]);

  const pause = useCallback(() => {
    if (!stateRef.current.isActive || stateRef.current.isPaused) return;
    
    setIsPaused(true);
    stateRef.current.isPaused = true;
    
    // Capture remaining time precisely
    const now = Date.now();
    const diff = Math.max(0, stateRef.current.endTime - now);
    const remainingSeconds = Math.max(0, diff / 1000);
    stateRef.current.remaining = remainingSeconds;
    setTimeRemaining(Math.ceil(remainingSeconds)); // Sync UI
  }, []);

  const resume = useCallback(() => {
    start();
  }, [start]);

  const handlePhaseComplete = useCallback(() => {
    const { phase, round, rounds: totalRounds } = stateRef.current;
    
    let nextPhase = phase;
    let nextRound = round;
    let shouldStop = false;

    if (phase === 'work') {
      if (round >= totalRounds) {
        shouldStop = true;
      } else {
        nextPhase = 'rest';
      }
    } else {
      nextPhase = 'work';
      nextRound = round + 1;
    }

    if (shouldStop) {
      stop();
      if (onComplete) onComplete();
    } else {
      setCurrentPhase(nextPhase);
      setCurrentRound(nextRound);
      
      const nextDuration = getDuration(nextPhase);
      setTimeRemaining(nextDuration);
      
      // Reset timer for next phase
      stateRef.current.phase = nextPhase;
      stateRef.current.round = nextRound;
      stateRef.current.endTime = Date.now() + (nextDuration * 1000);
      
      if (onPhaseChange) {
        onPhaseChange(nextPhase, nextRound);
      }
    }
  }, [getDuration, onComplete, onPhaseChange, stop]);

  const skipPhase = useCallback(() => {
    // Manually force phase switch
    handlePhaseComplete();
  }, [handlePhaseComplete]);

  // The tick loop
  useEffect(() => {
    let rafId;

    const loop = () => {
      const { isActive, isPaused, endTime } = stateRef.current;

      if (isActive && !isPaused) {
        const now = Date.now();
        const diff = endTime - now;
        const secondsRemaining = Math.ceil(diff / 1000);

        if (diff <= 0) {
           // Phase complete
           handlePhaseComplete();
           // Loop continues in next frame (handlePhaseComplete updates endTime)
        } else {
           // Only update state if changed to avoid re-renders
           setTimeRemaining((prev) => (prev !== secondsRemaining ? secondsRemaining : prev));
        }
      }

      rafId = requestAnimationFrame(loop);
    };

    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [handlePhaseComplete]); // Loop depends on handlePhaseComplete which is stable-ish

  return {
    timeRemaining,
    currentPhase,
    currentRound,
    isActive,
    isPaused,
    start,
    pause,
    resume,
    stop,
    skipPhase,
    setPhase: (phase, round) => {
        setCurrentPhase(phase);
        setCurrentRound(round);
        const duration = getDuration(phase);
        setTimeRemaining(duration);
        stateRef.current.phase = phase;
        stateRef.current.round = round;
        // If active, reset end time?
        if (stateRef.current.isActive) {
            stateRef.current.endTime = Date.now() + (duration * 1000);
        }
    }
  };
};


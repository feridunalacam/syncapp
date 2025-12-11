import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Timer Logic Hook - Manages workout timer
 * 
 * Phases: 'beforeStart' -> 'work' -> 'rest' -> 'work' -> 'rest' -> ... -> complete
 * 
 * Only 'beforeStart' has a countdown. Other phase transitions are instant.
 * Sound alerts at transitions are handled by the audio controller.
 */
export const useTimerLogic = ({
  workSec = 60,
  restSec = 30,
  rounds = 5,
  // Before Start countdown (in seconds, 0 = disabled)
  countdownBeforeStartSec = 0,
  // Callbacks
  onPhaseChange, // Called when phase changes (phase, round)
  onCountdownStart, // Called when beforeStart countdown starts
  onComplete,
}) => {
  const [timeRemaining, setTimeRemaining] = useState(workSec);
  const [currentPhase, setCurrentPhase] = useState('work'); // 'beforeStart', 'work', 'rest'
  const [currentRound, setCurrentRound] = useState(1);
  const [isActive, setIsActive] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isCountdownPhase, setIsCountdownPhase] = useState(false);

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
    countdownBeforeStartSec,
  });

  // Update refs when props/state change
  useEffect(() => {
    stateRef.current.workSec = workSec;
    stateRef.current.restSec = restSec;
    stateRef.current.rounds = rounds;
    stateRef.current.countdownBeforeStartSec = countdownBeforeStartSec;
    stateRef.current.phase = currentPhase;
    stateRef.current.round = currentRound;
    stateRef.current.isActive = isActive;
    stateRef.current.isPaused = isPaused;
  }, [workSec, restSec, rounds, countdownBeforeStartSec, currentPhase, currentRound, isActive, isPaused]);

  const getDuration = useCallback((phase) => {
    switch (phase) {
      case 'beforeStart':
        return stateRef.current.countdownBeforeStartSec;
      case 'work':
        return stateRef.current.workSec;
      case 'rest':
        return stateRef.current.restSec;
      default:
        return stateRef.current.workSec;
    }
  }, []);

  const isCountdown = useCallback((phase) => {
    return phase === 'beforeStart';
  }, []);

  const stop = useCallback(() => {
    setIsActive(false);
    setIsPaused(false);
    setIsCountdownPhase(false);
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
      stateRef.current.endTime = now + (stateRef.current.remaining * 1000);
    } else {
      // Start fresh - check if we should start with beforeStart countdown
      let startPhase = stateRef.current.phase;
      
      // Use prop value directly to avoid race condition with useEffect
      const beforeStartDuration = countdownBeforeStartSec || stateRef.current.countdownBeforeStartSec || 0;
      
      console.log('⏱️ start() called, beforeStartDuration:', beforeStartDuration);
      
      // If starting from work phase and beforeStart countdown is enabled, start with countdown
      if (startPhase === 'work' && stateRef.current.round === 1 && beforeStartDuration > 0) {
        console.log('⏱️ Starting with beforeStart countdown');
        startPhase = 'beforeStart';
        stateRef.current.phase = 'beforeStart';
        stateRef.current.countdownBeforeStartSec = beforeStartDuration;
        setCurrentPhase('beforeStart');
        setIsCountdownPhase(true);
        
        // Notify about countdown start
        if (onCountdownStart) {
          onCountdownStart('beforeStart', beforeStartDuration);
        }
      }
      
      const duration = getDuration(startPhase);
      console.log('⏱️ Starting phase:', startPhase, 'duration:', duration);
      stateRef.current.endTime = now + (duration * 1000);
      setTimeRemaining(duration);
    }

    setIsActive(true);
    setIsPaused(false);
    stateRef.current.isActive = true;
    stateRef.current.isPaused = false;
  }, [getDuration, onCountdownStart, countdownBeforeStartSec]);

  const pause = useCallback(() => {
    if (!stateRef.current.isActive || stateRef.current.isPaused) return;
    
    setIsPaused(true);
    stateRef.current.isPaused = true;
    
    // Capture remaining time precisely
    const now = Date.now();
    const diff = Math.max(0, stateRef.current.endTime - now);
    const remainingSeconds = Math.max(0, diff / 1000);
    stateRef.current.remaining = remainingSeconds;
    setTimeRemaining(Math.ceil(remainingSeconds));
  }, []);

  const resume = useCallback(() => {
    start();
  }, [start]);

  const handlePhaseComplete = useCallback(() => {
    const { phase, round, rounds: totalRounds } = stateRef.current;
    
    console.log('⏱️ handlePhaseComplete:', { phase, round, totalRounds });
    
    let nextPhase = phase;
    let nextRound = round;
    let shouldStop = false;

    // Simple phase transition: beforeStart -> work -> rest -> work -> rest -> ...
    switch (phase) {
      case 'beforeStart':
        // After beforeStart countdown, go to work
        nextPhase = 'work';
        break;
        
      case 'work':
        // After work, check if this is the last round
        if (round >= totalRounds) {
          shouldStop = true;
        } else {
          nextPhase = 'rest';
        }
        break;
        
      case 'rest':
        // After rest, go to next round's work
        nextPhase = 'work';
        nextRound = round + 1;
        break;
        
      default:
        nextPhase = 'work';
    }

    if (shouldStop) {
      console.log('⏰ Timer: Routine completed!');
      stop();
      if (onComplete) {
        onComplete();
      }
    } else {
      setCurrentPhase(nextPhase);
      setCurrentRound(nextRound);
      setIsCountdownPhase(false); // Only beforeStart is a countdown
      
      const nextDuration = getDuration(nextPhase);
      setTimeRemaining(nextDuration);
      
      // Reset timer for next phase
      stateRef.current.phase = nextPhase;
      stateRef.current.round = nextRound;
      stateRef.current.endTime = Date.now() + (nextDuration * 1000);
      
      // Notify about phase change (work or rest)
      if (onPhaseChange) {
        onPhaseChange(nextPhase, nextRound);
      }
    }
  }, [getDuration, onComplete, onPhaseChange, stop]);

  const skipPhase = useCallback(() => {
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
          handlePhaseComplete();
        } else {
          setTimeRemaining((prev) => (prev !== secondsRemaining ? secondsRemaining : prev));
        }
      }

      rafId = requestAnimationFrame(loop);
    };

    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [handlePhaseComplete]);

  return {
    timeRemaining,
    currentPhase,
    currentRound,
    isActive,
    isPaused,
    isCountdownPhase,
    start,
    pause,
    resume,
    stop,
    skipPhase,
    setPhase: (phase, round) => {
      setCurrentPhase(phase);
      setCurrentRound(round);
      setIsCountdownPhase(isCountdown(phase));
      const duration = getDuration(phase);
      setTimeRemaining(duration);
      stateRef.current.phase = phase;
      stateRef.current.round = round;
      if (stateRef.current.isActive) {
        stateRef.current.endTime = Date.now() + (duration * 1000);
      }
    }
  };
};

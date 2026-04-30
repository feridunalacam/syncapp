import React, { useMemo, useRef, useEffect, useCallback, useState } from 'react';
import { View, Animated } from 'react-native';
import Svg, { Path, Defs, LinearGradient as SvgLinearGradient, Stop } from 'react-native-svg';
import { createScreenStyles } from '../../../styles/screenStyles';
import { useTheme } from '../../../context/ThemeContext';

const STROKE_WIDTH = 33.9026688; // Base stroke width
const WORK_STROKE_WIDTH = STROKE_WIDTH * 0.96; // 32.546 (20% decrease from 1.2)
const REST_STROKE_WIDTH = STROKE_WIDTH * 0.9; // 30.512 (10% decrease)
const STROKE_WIDTH_OLD = 21.84;
const STROKE_WIDTH_INCREASE = (STROKE_WIDTH - STROKE_WIDTH_OLD) / 2; // Half increase on each side
const TIMER_RADIUS = 222.46 - STROKE_WIDTH_INCREASE; // Adjusted to maintain distance
const INNER_CIRCLE_RADIUS = TIMER_RADIUS - (WORK_STROKE_WIDTH + REST_STROKE_WIDTH) / 2; // Perfectly adjacent to outer ring

export const TimerDesign = ({
  isWorkoutRunning,
  isPaused,
  timeRemaining,
  currentPhase,
  currentRound, // Add this prop
  selectedRoutine,
  isCountdownActive,
  countdownTime,
}) => {
  const { theme, isDark } = useTheme();
  const screenStyles = useMemo(() => createScreenStyles({ ...theme, isDark }), [theme, isDark]);
  const timerScaleAnim = useRef(new Animated.Value(1)).current;
  const previousPhaseRef = useRef(null);

  // Pulse animation - only on phase change or last 5 seconds
  const lastPulseTimeRef = useRef(null);
  
  useEffect(() => {
    if (!isWorkoutRunning || isPaused) return;
    
    // Get total duration for current phase
    const totalTime = currentPhase === 'work' 
      ? (selectedRoutine?.workSec || 60) 
      : (selectedRoutine?.restSec || 30);
    
    // Only pulse on phase start or last 5 seconds
    const isPhaseStart = timeRemaining === totalTime;
    const isLastSeconds = timeRemaining <= 5 && timeRemaining > 0;
    
    // Prevent double pulse in same second
    const now = Date.now();
    if (lastPulseTimeRef.current && now - lastPulseTimeRef.current < 900) return;
    
    if (isPhaseStart || isLastSeconds) {
      lastPulseTimeRef.current = now;
      timerScaleAnim.setValue(1);
      Animated.sequence([
        Animated.timing(timerScaleAnim, { 
          toValue: 1.03, 
          duration: 150, 
          useNativeDriver: true,
        }),
        Animated.timing(timerScaleAnim, { 
          toValue: 1, 
          duration: 150, 
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [isWorkoutRunning, isPaused, timeRemaining, currentPhase, selectedRoutine, timerScaleAnim]);

  const formattedTime = useMemo(() => {
    if (isCountdownActive && countdownTime !== null) return String(countdownTime);
    if (timeRemaining < 60) return String(timeRemaining);
    if (timeRemaining === 60) return '60';
    const mins = Math.floor(timeRemaining / 60);
    const secs = timeRemaining % 60;
    return `${mins}:${String(secs).padStart(2, '0')}`;
  }, [isCountdownActive, countdownTime, timeRemaining]);

  // Smooth progress animation using requestAnimationFrame
  const [smoothProgress, setSmoothProgress] = useState(0);
  const [workProgress, setWorkProgress] = useState(1.0);
  const [restProgress, setRestProgress] = useState(1.0);
  const [smoothWorkProgressOpacity, setSmoothWorkProgressOpacity] = useState(1);
  const [smoothRestProgressOpacity, setSmoothRestProgressOpacity] = useState(1);
  const [completionFadeStartTime, setCompletionFadeStartTime] = useState(null);
  const phaseStartTimeRef = useRef(null);
  const lastSyncTimeRemainingRef = useRef(null);
  const lastPausedStateRef = useRef(false);
  const completionStartStateRef = useRef(null);
  const smoothProgressRef = useRef(0);

  // When idle (no workout running), both rings should appear full
  useEffect(() => {
    if (!isWorkoutRunning && !completionFadeStartTime) {
      setWorkProgress(1.0);
      setRestProgress(1.0);
      setSmoothWorkProgressOpacity(1);
      setSmoothRestProgressOpacity(1);
    }
  }, [isWorkoutRunning, selectedRoutine, completionFadeStartTime]);

  useEffect(() => {
    if (!isWorkoutRunning || !selectedRoutine) {
      // If workout was running and now stopped, start completion fade
      if (workProgress > 0 || restProgress > 0 || smoothProgress > 0 || smoothProgressRef.current > 0) {
        completionStartStateRef.current = {
          workProgress,
          restProgress,
          workOpacity: smoothWorkProgressOpacity,
          restOpacity: smoothRestProgressOpacity,
        };
        setCompletionFadeStartTime(Date.now());
      } else {
        setSmoothProgress(0);
        setWorkProgress(1.0);
        setRestProgress(1.0);
        setSmoothWorkProgressOpacity(1);
        setSmoothRestProgressOpacity(1);
        setCompletionFadeStartTime(null);
        smoothProgressRef.current = 0;
        phaseStartTimeRef.current = null;
        lastSyncTimeRemainingRef.current = null;
        previousPhaseRef.current = null;
        lastPausedStateRef.current = false;
      }
      return;
    }
    
    // Reset completion fade when workout starts
    setCompletionFadeStartTime(null);

    const totalTime = currentPhase === 'work' ? (selectedRoutine.workSec || 60) : selectedRoutine.restSec;
    
    // Calculate expected time remaining based on current animation state
    let currentSmoothTimeRemaining = null;
    if (phaseStartTimeRef.current && !isPaused) {
         const elapsed = (Date.now() - phaseStartTimeRef.current) / 1000;
         currentSmoothTimeRemaining = totalTime - elapsed;
    }

    // Detect pause/resume transitions
    const wasPaused = lastPausedStateRef.current;
    const isNowPaused = isPaused;
    const isResuming = wasPaused && !isNowPaused;

    // Drift check: if our local smooth time is too far from the prop timeRemaining
    const isDrifting = currentSmoothTimeRemaining !== null && 
                       Math.abs(currentSmoothTimeRemaining - timeRemaining) > 1.5;

    const isPhaseChanged = previousPhaseRef.current !== currentPhase;
    const isFirstStart = phaseStartTimeRef.current === null;
    
    const shouldReset = isPhaseChanged || isDrifting || isResuming || isFirstStart;
    
    // Handle phase transitions
    if (previousPhaseRef.current !== currentPhase) {
      const isInitialPhase = previousPhaseRef.current === null;
      if (currentPhase === 'work') {
        setWorkProgress(1.0);
        setSmoothWorkProgressOpacity(1);
        setRestProgress(isInitialPhase ? 1.0 : 0);
        setSmoothRestProgressOpacity(isInitialPhase ? 1 : 0);
      } else {
        setRestProgress(1.0);
        setSmoothRestProgressOpacity(1);
        setWorkProgress(0);
        setSmoothWorkProgressOpacity(0);
      }
    }
    
    if (shouldReset) {
      let elapsed = totalTime - timeRemaining;
      if (isResuming && smoothProgressRef.current > 0) {
         const elapsedFromProgress = smoothProgressRef.current * totalTime;
         if (Math.abs(elapsedFromProgress - elapsed) < 1.5) {
             elapsed = elapsedFromProgress;
         }
      }
      phaseStartTimeRef.current = Date.now() - (elapsed * 1000);
      previousPhaseRef.current = currentPhase;
    }
    
    lastPausedStateRef.current = isNowPaused;

    let rafId;
    const animate = () => {
      if (!isWorkoutRunning || !selectedRoutine || !phaseStartTimeRef.current) {
        return;
      }

      if (isPaused) {
        rafId = requestAnimationFrame(animate);
        return;
      }

      const now = Date.now();
      const elapsedMs = now - phaseStartTimeRef.current;
      const elapsedSeconds = elapsedMs / 1000;
      
      const newProgress = Math.max(0, Math.min(1, elapsedSeconds / totalTime));
      const reversedProgress = 1 - newProgress;
      
      smoothProgressRef.current = newProgress;
      setSmoothProgress(newProgress);

      if (currentPhase === 'work') {
        setWorkProgress(reversedProgress);
        setSmoothWorkProgressOpacity(1);
        
        const workTimeRemaining = totalTime - elapsedSeconds;
        
        if (currentRound === 1) {
          setRestProgress(1.0);
          setSmoothRestProgressOpacity(1);
        } else {
          const fillStartTime = 5;
          const fillDuration = 3;
          const waitTime = 2;
          
          if (workTimeRemaining <= fillStartTime && workTimeRemaining > waitTime) {
            const fillProgress = (fillStartTime - workTimeRemaining) / fillDuration;
            setRestProgress(Math.min(1, fillProgress));
            setSmoothRestProgressOpacity(1);
          } else if (workTimeRemaining <= waitTime && workTimeRemaining >= 0) {
            setRestProgress(1.0);
            setSmoothRestProgressOpacity(1);
          } else {
            setRestProgress(0);
            setSmoothRestProgressOpacity(0);
          }
        }
      }

      if (currentPhase === 'rest') {
        setRestProgress(reversedProgress);
        setSmoothRestProgressOpacity(1);
        
        const restTimeRemaining = totalTime - elapsedSeconds;
        const fillStartTime = 5;
        const fillDuration = 3;
        const waitTime = 2;
        
        if (restTimeRemaining <= fillStartTime && restTimeRemaining > waitTime) {
          const fillProgress = (fillStartTime - restTimeRemaining) / fillDuration;
          setWorkProgress(Math.min(1, fillProgress));
          setSmoothWorkProgressOpacity(1);
        } else if (restTimeRemaining <= waitTime && restTimeRemaining >= 0) {
          setWorkProgress(1.0);
          setSmoothWorkProgressOpacity(1);
        } else {
          setWorkProgress(0);
          setSmoothWorkProgressOpacity(0);
        }
      }

      if (isWorkoutRunning && !isPaused) {
        rafId = requestAnimationFrame(animate);
      }
    };

    rafId = requestAnimationFrame(animate);

    return () => {
      if (rafId) {
        cancelAnimationFrame(rafId);
      }
    };
  }, [isWorkoutRunning, isPaused, selectedRoutine, currentPhase, timeRemaining, currentRound]);

  // Handle completion fade back to full circles when workout stops
  useEffect(() => {
    if (!completionFadeStartTime) return;

    let rafId;
    const fadeDuration = 1000; // 1 second

    const {
      workProgress: startWorkProgress = workProgress,
      restProgress: startRestProgress = restProgress,
      workOpacity: startWorkOpacity = smoothWorkProgressOpacity,
      restOpacity: startRestOpacity = smoothRestProgressOpacity,
    } = completionStartStateRef.current || {};

    const animateFade = () => {
      const elapsed = Date.now() - completionFadeStartTime;
      const fadeProgress = Math.min(1, elapsed / fadeDuration);
      const eased = fadeProgress; // linear easing for now

      setWorkProgress(startWorkProgress + (1 - startWorkProgress) * eased);
      setRestProgress(startRestProgress + (1 - startRestProgress) * eased);
      setSmoothWorkProgressOpacity(startWorkOpacity + (1 - startWorkOpacity) * eased);
      setSmoothRestProgressOpacity(startRestOpacity + (1 - startRestOpacity) * eased);

      if (fadeProgress < 1) {
        rafId = requestAnimationFrame(animateFade);
      } else {
        // Fade complete, reset everything
        setSmoothProgress(0);
        setWorkProgress(1.0);
        setRestProgress(1.0);
        setSmoothWorkProgressOpacity(1);
        setSmoothRestProgressOpacity(1);
        setCompletionFadeStartTime(null);
        completionStartStateRef.current = null;
      }
    };

    rafId = requestAnimationFrame(animateFade);

    return () => {
      if (rafId) {
        cancelAnimationFrame(rafId);
      }
    };
  }, [completionFadeStartTime]);

  const createArcPath = useCallback((progress, radius = TIMER_RADIUS) => {
    if (progress <= 0) return '';
    const cx = 194, cy = 194, r = radius;
    const startAngle = -90;
    
    // If progress is 1.0, draw a complete circle that closes at 12 o'clock
    if (progress >= 1.0) {
      const startX = cx;
      const startY = cy - r;
      // Draw full circle using two arcs to close at 12 o'clock
      return `M ${startX} ${startY} A ${r} ${r} 0 1 1 ${startX} ${startY + 2 * r} A ${r} ${r} 0 1 1 ${startX} ${startY}`;
    }
    
    const endAngle = startAngle + (progress * 360);
    const startAngleRad = (startAngle * Math.PI) / 180;
    const endAngleRad = (endAngle * Math.PI) / 180;
    const x1 = cx + r * Math.cos(startAngleRad);
    const y1 = cy + r * Math.sin(startAngleRad);
    const x2 = cx + r * Math.cos(endAngleRad);
    const y2 = cy + r * Math.sin(endAngleRad);
    const largeArcFlag = progress > 0.5 ? 1 : 0;
    return `M ${x1} ${y1} A ${r} ${r} 0 ${largeArcFlag} 1 ${x2} ${y2}`;
  }, []);

  // Create arc path for a specific progress range (from startProgress to endProgress)
  const createArcPathRange = useCallback((startProgress, endProgress, radius = TIMER_RADIUS) => {
    if (startProgress >= endProgress || endProgress <= 0) return '';
    const cx = 194, cy = 194, r = radius;
    const startAngle = -90;
    
    const startAngleValue = startAngle + (startProgress * 360);
    const endAngleValue = startAngle + (endProgress * 360);
    const startAngleRad = (startAngleValue * Math.PI) / 180;
    const endAngleRad = (endAngleValue * Math.PI) / 180;
    const x1 = cx + r * Math.cos(startAngleRad);
    const y1 = cy + r * Math.sin(startAngleRad);
    const x2 = cx + r * Math.cos(endAngleRad);
    const y2 = cy + r * Math.sin(endAngleRad);
    const progressRange = endProgress - startProgress;
    const largeArcFlag = progressRange > 0.5 ? 1 : 0;
    return `M ${x1} ${y1} A ${r} ${r} 0 ${largeArcFlag} 1 ${x2} ${y2}`;
  }, []);

  // Get color for a specific progress percentage (0-1) in orange gradient
  const getOrangeGradientColor = useCallback((progress) => {
    // Clamp progress between 0 and 1
    progress = Math.max(0, Math.min(1, progress));
    
    // Color stops: every 5% from #f3ae3e (start) -> #e94325 (middle) -> #ea642b (end)
    const colors = [
      '#f3ae3e', // 0%
      '#f2a73b', // 5%
      '#f1a038', // 10%
      '#f09935', // 15%
      '#ef9232', // 20%
      '#ee8b2f', // 25%
      '#ed842c', // 30%
      '#ec7d29', // 35%
      '#eb7626', // 40%
      '#ea6f23', // 45%
      '#e94325', // 50%
      '#e94826', // 55%
      '#e94d27', // 60%
      '#e95228', // 65%
      '#e95729', // 70%
      '#e95c2a', // 75%
      '#ea612b', // 80%
      '#ea632b', // 85%
      '#ea642b', // 90%
      '#ea642b', // 95%
      '#ea642b', // 100%
    ];
    
    // Calculate which segment we're in
    const segmentIndex = Math.floor(progress * 20); // 0-20 segments
    const segmentProgress = (progress * 20) % 1; // Progress within segment (0-1)
    
    // Get the two colors for interpolation
    const color1 = colors[Math.min(segmentIndex, colors.length - 1)];
    const color2 = colors[Math.min(segmentIndex + 1, colors.length - 1)];
    
    // If at exact segment boundary, return that color
    if (segmentProgress === 0 || segmentIndex >= colors.length - 1) {
      return colors[Math.min(segmentIndex, colors.length - 1)];
    }
    
    // Interpolate between colors
    const hex1 = parseInt(color1.substring(1), 16);
    const hex2 = parseInt(color2.substring(1), 16);
    
    const r1 = (hex1 >> 16) & 0xFF;
    const g1 = (hex1 >> 8) & 0xFF;
    const b1 = hex1 & 0xFF;
    
    const r2 = (hex2 >> 16) & 0xFF;
    const g2 = (hex2 >> 8) & 0xFF;
    const b2 = hex2 & 0xFF;
    
    const r = Math.round(r1 + (r2 - r1) * segmentProgress);
    const g = Math.round(g1 + (g2 - g1) * segmentProgress);
    const b = Math.round(b1 + (b2 - b1) * segmentProgress);
    
    return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
  }, []);

  // Get color for a specific progress percentage (0-1) in blue gradient
  const getBlueGradientColor = useCallback((progress) => {
    // Clamp progress between 0 and 1
    progress = Math.max(0, Math.min(1, progress));
    
    // Color stops: every 5% from #00bfff to #00ddff
    const colors = [
      '#00bfff', // 0%
      '#00c0ff', // 5%
      '#00c2ff', // 10%
      '#00c4ff', // 15%
      '#00c5ff', // 20%
      '#00c6ff', // 25%
      '#00c8ff', // 30%
      '#00caff', // 35%
      '#00cbff', // 40%
      '#00ccff', // 45%
      '#00ceff', // 50%
      '#00d0ff', // 55%
      '#00d1ff', // 60%
      '#00d2ff', // 65%
      '#00d4ff', // 70%
      '#00d6ff', // 75%
      '#00d7ff', // 80%
      '#00d8ff', // 85%
      '#00daff', // 90%
      '#00dcff', // 95%
      '#00ddff', // 100%
    ];
    
    // Calculate which segment we're in
    const segmentIndex = Math.floor(progress * 20); // 0-20 segments
    const segmentProgress = (progress * 20) % 1; // Progress within segment (0-1)
    
    // Get the two colors for interpolation
    const color1 = colors[Math.min(segmentIndex, colors.length - 1)];
    const color2 = colors[Math.min(segmentIndex + 1, colors.length - 1)];
    
    // If at exact segment boundary, return that color
    if (segmentProgress === 0 || segmentIndex >= colors.length - 1) {
      return colors[Math.min(segmentIndex, colors.length - 1)];
    }
    
    // Interpolate between colors
    const hex1 = parseInt(color1.substring(1), 16);
    const hex2 = parseInt(color2.substring(1), 16);
    
    const r1 = (hex1 >> 16) & 0xFF;
    const g1 = (hex1 >> 8) & 0xFF;
    const b1 = hex1 & 0xFF;
    
    const r2 = (hex2 >> 16) & 0xFF;
    const g2 = (hex2 >> 8) & 0xFF;
    const b2 = hex2 & 0xFF;
    
    const r = Math.round(r1 + (r2 - r1) * segmentProgress);
    const g = Math.round(g1 + (g2 - g1) * segmentProgress);
    const b = Math.round(b1 + (b2 - b1) * segmentProgress);
    
    return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
  }, []);

  // Create progress bar segments with gradient colors (5% segments)
  const createProgressBarSegments = useCallback((progress, radius = TIMER_RADIUS) => {
    if (progress <= 0) return [];
    
    const segmentSize = 0.05; // 5% segments
    const segments = [];
    const numSegments = Math.ceil(progress / segmentSize);
    
    for (let i = 0; i < numSegments; i++) {
      // Ensure segments connect seamlessly with small overlap to prevent gaps
      const segmentStart = i > 0 ? i * segmentSize - 0.0001 : i * segmentSize;
      const segmentEnd = Math.min((i + 1) * segmentSize, progress);
      
      if (segmentEnd <= segmentStart) break;
      
      // Use the middle point of the segment for color
      const segmentMidProgress = (segmentStart + segmentEnd) / 2;
      const color = getOrangeGradientColor(segmentMidProgress);
      
      const path = createArcPathRange(segmentStart, segmentEnd, radius);
      if (path) {
        segments.push({
          path: path,
          color: color,
        });
      }
    }
    
    return segments;
  }, [createArcPathRange, getOrangeGradientColor]);

  // Create rest progress bar segments with blue gradient colors (5% segments)
  const createRestProgressBarSegments = useCallback((progress, radius = INNER_CIRCLE_RADIUS) => {
    if (progress <= 0) return [];
    
    const segmentSize = 0.05; // 5% segments
    const segments = [];
    const numSegments = Math.ceil(progress / segmentSize);
    
    for (let i = 0; i < numSegments; i++) {
      // Ensure segments connect seamlessly with small overlap to prevent gaps
      const segmentStart = i > 0 ? i * segmentSize - 0.0001 : i * segmentSize;
      const segmentEnd = Math.min((i + 1) * segmentSize, progress);
      
      if (segmentEnd <= segmentStart) break;
      
      // Use the middle point of the segment for color
      const segmentMidProgress = (segmentStart + segmentEnd) / 2;
      const color = getBlueGradientColor(segmentMidProgress);
      
      const path = createArcPathRange(segmentStart, segmentEnd, radius);
      if (path) {
        segments.push({
          path: path,
          color: color,
        });
      }
    }
    
    return segments;
  }, [createArcPathRange, getBlueGradientColor]);

  // Create full circle path (for background circles) - only the stroke is rendered
  const createFullCirclePath = useCallback((radius) => {
    const cx = 194, cy = 194, r = radius;
    // Start at top (12 o'clock), draw full circle using two arcs
    const startX = cx;
    const startY = cy - r;
    // Two semicircle arcs to form a complete circle
    return `M ${startX} ${startY} A ${r} ${r} 0 1 1 ${startX} ${startY + 2 * r} A ${r} ${r} 0 1 1 ${startX} ${startY}`;
  }, []);



  return (
    <View style={screenStyles.timerBox}>
      <View style={screenStyles.timerContainer}>
        <Svg width={389} height={389} viewBox="-42 -42 473 473" style={{ position: 'absolute' }}>
          <Defs>
            <SvgLinearGradient id="orangeGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <Stop offset="0%" stopColor="#f3ae3e" />
              <Stop offset="50%" stopColor="#e94325" />
              <Stop offset="100%" stopColor="#ea642b" />
            </SvgLinearGradient>
            <SvgLinearGradient id="blueGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <Stop offset="0%" stopColor="#00bfff" stopOpacity="1" />
              <Stop offset="100%" stopColor="#00ddff" stopOpacity="1" />
            </SvgLinearGradient>
          </Defs>
          {/* Outer circle stroke - only the stroke thickness is rendered */}
          <Path d={createFullCirclePath(TIMER_RADIUS)} stroke="#d5d1d0" strokeWidth={WORK_STROKE_WIDTH} fill="none" opacity=".4" />
          {/* Inner circle stroke - only the stroke thickness is rendered */}
          <Path d={createFullCirclePath(INNER_CIRCLE_RADIUS)} stroke="#d5d1d0" strokeWidth={REST_STROKE_WIDTH} fill="none" opacity=".4" />
          {/* Work progress bar */}
          {workProgress > 0 && smoothWorkProgressOpacity > 0 && 
            createProgressBarSegments(workProgress, TIMER_RADIUS).map((segment, index, segments) => (
              <Path 
                key={`work-segment-${index}`}
                d={segment.path} 
                stroke={segment.color}
                strokeWidth={WORK_STROKE_WIDTH} 
                fill="none" 
                strokeLinecap="round" 
                opacity={smoothWorkProgressOpacity}
              />
            ))
          }
          {/* Rest progress bar */}
          {restProgress > 0 && smoothRestProgressOpacity > 0 && 
            createRestProgressBarSegments(restProgress, INNER_CIRCLE_RADIUS).map((segment, index, segments) => (
              <Path 
                key={`rest-segment-${index}`}
                d={segment.path} 
                stroke={segment.color}
                strokeWidth={REST_STROKE_WIDTH} 
                fill="none" 
                strokeLinecap="round" 
                opacity={smoothRestProgressOpacity}
              />
            ))
          }
        </Svg>
        <Animated.Text
          style={[screenStyles.timerValue, {
            transform: [{ scale: timerScaleAnim }],
          }]}
          allowFontScaling={false}
          accessibilityLabel={`Timer ${formattedTime}`}
        >
          {formattedTime}
        </Animated.Text>
      </View>
    </View>
  );
};


import { useMemo, useState, useRef, useCallback, useEffect } from 'react';
import { Alert, Share, LayoutAnimation, Platform, UIManager } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useRoutineContext } from '../../../context/RoutineContext';
import { usePostContext } from '../../../context/PostContext';
import { getLogDuration, getLogRounds } from '../../../domain/routines';
import useConfirm from '../../../hooks/useConfirm';

const clipboardImage = (value) => {
  const match =
    typeof value === 'string' && /^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match || match[1].length % 4 !== 0)
    throw new Error('Create the share image again before copying it.');
  return match[1];
};

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export const useLogData = () => {
  const { completedRoutines, clearCompletedRoutines, removeCompletedRoutine } = useRoutineContext();
  const { addPost } = usePostContext();
  const confirm = useConfirm();

  const [selectedLog, setSelectedLog] = useState(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [publishCaption, setPublishCaption] = useState('');
  const [publishCategory, setPublishCategory] = useState('sport');
  const shareCardRef = useRef(null);
  const shareCardTransparentRef = useRef(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [generatedImages, setGeneratedImages] = useState({ full: null, transparent: null });
  const [isGenerating, setIsGenerating] = useState(false);
  const shareRevision = useRef(0);
  const selectedRef = useRef(selectedLog);
  selectedRef.current = selectedLog;
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      shareRevision.current++;
    };
  }, []);
  const retireSelection = useCallback(() => {
    shareRevision.current++;
    selectedRef.current = null;
    setSelectedLog(null);
    setIsGenerating(false);
    setGeneratedImages({ full: null, transparent: null });
    setShowShareModal(false);
    setShowDetailModal(false);
    setShowPublishModal(false);
  }, []);

  const sortedCompleted = useMemo(() => {
    return [...completedRoutines].sort((a, b) => {
      return new Date(b.completedAt) - new Date(a.completedAt);
    });
  }, [completedRoutines]);

  const stats = useMemo(() => {
    const totalWorkouts = completedRoutines.length;
    // Prefer the actually elapsed wall-clock time (recorded when the workout
    // ended). Falls back to the planned duration for legacy log entries that
    // were saved before we started tracking real elapsed time.
    const totalTime = completedRoutines.reduce((sum, item) => sum + getLogDuration(item), 0);
    const totalRounds = completedRoutines.reduce((sum, item) => sum + getLogRounds(item), 0);

    const totalMinutes = Math.floor(totalTime / 60);
    const totalHours = Math.floor(totalMinutes / 60);
    const remainingMinutes = totalMinutes % 60;

    return {
      totalWorkouts,
      totalRounds,
      totalTime:
        totalTime > 0 && totalMinutes === 0
          ? '<1m'
          : totalHours > 0
            ? `${totalHours}h ${remainingMinutes}m`
            : `${totalMinutes}m`,
    };
  }, [completedRoutines]);

  const groupedRoutines = useMemo(() => {
    const groups = {};
    sortedCompleted.forEach((routine) => {
      const date = new Date(routine.completedAt);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const thisWeek = new Date(today);
      thisWeek.setDate(thisWeek.getDate() - 7);

      let groupKey;
      if (date >= today) {
        groupKey = 'Today';
      } else if (date >= yesterday) {
        groupKey = 'Yesterday';
      } else if (date >= thisWeek) {
        groupKey = 'This Week';
      } else {
        const monthYear = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        groupKey = monthYear;
      }

      if (!groups[groupKey]) {
        groups[groupKey] = [];
      }
      groups[groupKey].push(routine);
    });

    return groups;
  }, [sortedCompleted]);

  const hasLogs = completedRoutines.length > 0;

  const handleClearAll = useCallback(() => {
    if (completedRoutines.length === 0) return;
    confirm({
      title: 'Clear All Logs',
      message:
        'Are you sure you want to clear all completed routines? This action cannot be undone.',
      confirmLabel: 'Clear All',
      destructive: true,
      onConfirm: () => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        retireSelection();
        clearCompletedRoutines();
        setIsEditMode(false);
      },
    });
  }, [completedRoutines.length, clearCompletedRoutines, confirm, retireSelection]);

  const toggleEditMode = useCallback(() => {
    if (!hasLogs && !isEditMode) return;
    setIsEditMode((prev) => !prev);
  }, [hasLogs, isEditMode]);

  const handleDeleteLog = useCallback(
    (log) => {
      confirm({
        title: 'Delete Entry',
        message: `Remove "${log.name}" from your workout log?`,
        confirmLabel: 'Delete',
        destructive: true,
        onConfirm: () => {
          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          removeCompletedRoutine(log.id, log.completedAt, log.sessionId);
          const selected = selectedRef.current;
          if (
            selected &&
            (log.sessionId
              ? selected.sessionId === log.sessionId
              : selected.id === log.id && selected.completedAt === log.completedAt)
          ) {
            retireSelection();
          }
        },
      });
    },
    [confirm, removeCompletedRoutine, retireSelection],
  );

  const formatTime = useCallback((completed) => {
    const date = new Date(completed.completedAt);
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    return `${displayHours}:${String(minutes).padStart(2, '0')} ${ampm}`;
  }, []);

  const handleLogPress = useCallback((completed) => {
    shareRevision.current++;
    selectedRef.current = completed;
    setIsGenerating(false);
    setGeneratedImages({ full: null, transparent: null });
    setShowShareModal(false);
    setSelectedLog(completed);
    setShowDetailModal(true);
  }, []);

  const handlePublish = useCallback(() => {
    if (!selectedLog) return;
    setShowDetailModal(false);
    setShowPublishModal(true);
  }, [selectedLog]);

  const confirmPublish = useCallback(() => {
    if (!selectedLog || selectedRef.current !== selectedLog) return;

    const newPost = {
      id: `post-${Date.now()}`,
      authorId: 'current-user',
      authorName: 'You',
      routine: { ...selectedLog },
      type: selectedLog.status === 'aborted' ? 'session' : 'completed',
      category: publishCategory,
      caption: publishCaption.trim() || `My ${selectedLog.name} session 💪`,
      createdAt: new Date().toISOString(),
      likes: 0,
      liked: false,
      upvotes: 0,
      downvotes: 0,
      userVote: 0,
    };

    addPost(newPost);
    retireSelection();
    setPublishCaption('');
    setPublishCategory('sport');
    Alert.alert(
      'Saved on this device',
      'Your session is now in Discover. Online publishing is not connected yet.',
    );
  }, [addPost, publishCaption, publishCategory, selectedLog, retireSelection]);

  // Bounded poll for the off-screen ViewShot refs to mount. Previously this
  // recursed via setTimeout indefinitely with no cleanup, which could leak
  // timers if `selectedLog` was cleared mid-wait.
  const SHARE_REFS_MAX_WAIT_MS = 3000;
  const SHARE_REFS_POLL_INTERVAL_MS = 50;

  const waitForShareRefs = useCallback((isCurrent) => {
    return new Promise((resolve) => {
      const start = Date.now();
      const tick = () => {
        if (!isCurrent()) {
          resolve(false);
          return;
        }
        if (shareCardRef.current && shareCardTransparentRef.current) {
          resolve(true);
          return;
        }
        if (Date.now() - start >= SHARE_REFS_MAX_WAIT_MS) {
          resolve(false);
          return;
        }
        setTimeout(tick, SHARE_REFS_POLL_INTERVAL_MS);
      };
      tick();
    });
  }, []);

  const generateShareImages = useCallback(async () => {
    if (!selectedLog) return;
    const version = ++shareRevision.current;
    const isCurrent = () =>
      mounted.current && version === shareRevision.current && selectedRef.current === selectedLog;

    try {
      setIsGenerating(true);

      const refsReady = await waitForShareRefs(isCurrent);
      if (!isCurrent()) return;
      if (!refsReady) {
        throw new Error('Share preview not ready');
      }

      const [fullImageUri, transparentImageUri] = await Promise.all([
        shareCardRef.current.capture(),
        shareCardTransparentRef.current.capture(),
      ]);
      if (!isCurrent()) return;

      setGeneratedImages({
        full: fullImageUri,
        transparent: transparentImageUri,
      });
      setShowShareModal(true);
    } catch (error) {
      if (isCurrent()) {
        console.error('Error generating images:', error);
        Alert.alert('Error', 'Failed to generate images. Please try again.');
      }
    } finally {
      if (isCurrent()) setIsGenerating(false);
    }
  }, [selectedLog, waitForShareRefs]);

  const handleShare = useCallback(async () => {
    if (!selectedLog) return;
    setShowDetailModal(false);
    await generateShareImages();
  }, [generateShareImages, selectedLog]);

  const handleCopyImage = useCallback(
    async (imageType = 'transparent') => {
      const imageUri = imageType === 'full' ? generatedImages.full : generatedImages.transparent;
      if (!imageUri) return;

      try {
        setIsCapturing(true);
        const base64 = clipboardImage(imageUri);
        await Clipboard.setImageAsync(base64);

        setIsCapturing(false);
        const imageName = imageType === 'full' ? 'Instagram post' : 'Reels';
        Alert.alert('Success', `${imageName} image copied to clipboard!`);
      } catch (error) {
        console.error('Error copying image:', error);
        setIsCapturing(false);
        Alert.alert('Error', 'Failed to copy image. Please try again.');
      }
    },
    [generatedImages],
  );

  const handleShareToPlatform = useCallback(
    async (platform) => {
      if (!selectedLog || !generatedImages.full || !generatedImages.transparent) {
        await generateShareImages();
        return;
      }

      try {
        setIsCapturing(true);

        const useTransparent = platform === 'instagram-story' || platform === 'instagram-messages';
        const imageUri = useTransparent ? generatedImages.transparent : generatedImages.full;
        const base64 = clipboardImage(imageUri);

        if (platform === 'native') {
          await Share.share({
            message: `My ${selectedLog.name} session 💪`,
            title: `Workout: ${selectedLog.name}`,
          });
        } else if (platform === 'instagram-story' || platform === 'instagram-messages') {
          await Clipboard.setImageAsync(base64);
          Alert.alert('Copied!', 'Image copied to clipboard. Open Instagram and paste it!');
        } else if (platform === 'whatsapp' || platform === 'facebook' || platform === 'message') {
          await Clipboard.setImageAsync(base64);
          Alert.alert('Copied!', 'Image copied to clipboard. Open the app and paste it!');
        } else if (platform === 'copy-link') {
          const workoutText = `My ${selectedLog.name} session 💪\n${selectedLog.rounds} rounds • ${selectedLog.workSec}s work / ${selectedLog.restSec}s rest`;
          await Clipboard.setStringAsync(workoutText);
          Alert.alert('Copied!', 'Workout details copied to clipboard!');
        }

        setIsCapturing(false);
        setShowShareModal(false);
      } catch (error) {
        console.error('Error sharing:', error);
        setIsCapturing(false);
        Alert.alert('Error', 'Failed to share. Please try again.');
      }
    },
    [generateShareImages, generatedImages, selectedLog],
  );

  return {
    state: {
      selectedLog,
      isEditMode,
      showDetailModal,
      showPublishModal,
      showShareModal,
      publishCaption,
      publishCategory,
      isCapturing,
      generatedImages,
      isGenerating,
    },
    setters: {
      setSelectedLog,
      setShowDetailModal,
      setShowPublishModal,
      setShowShareModal,
      setPublishCaption,
      setPublishCategory,
    },
    refs: {
      shareCardRef,
      shareCardTransparentRef,
    },
    derived: {
      stats,
      groupedRoutines,
      sortedCompleted,
      hasLogs,
    },
    handlers: {
      handleClearAll,
      toggleEditMode,
      handleDeleteLog,
      formatTime,
      handleLogPress,
      handlePublish,
      confirmPublish,
      handleShare,
      handleCopyImage,
      handleShareToPlatform,
    },
  };
};

import { useMemo, useState, useRef, useCallback } from 'react';
import { Alert, Share } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useRoutineContext } from '../../../context/RoutineContext';
import { usePostContext } from '../../../context/PostContext';

export const useLogData = () => {
  const { completedRoutines, clearCompletedRoutines, removeCompletedRoutine } = useRoutineContext();
  const { addPost } = usePostContext();

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

  const sortedCompleted = useMemo(() => {
    return [...completedRoutines].sort((a, b) => {
      return new Date(b.completedAt) - new Date(a.completedAt);
    });
  }, [completedRoutines]);

  const stats = useMemo(() => {
    const totalWorkouts = completedRoutines.length;
    const totalTime = completedRoutines.reduce((sum, routine) => {
      const duration = routine.rounds * (routine.workSec + routine.restSec);
      return sum + duration;
    }, 0);
    const totalRounds = completedRoutines.reduce((sum, routine) => sum + routine.rounds, 0);

    const totalMinutes = Math.floor(totalTime / 60);
    const totalHours = Math.floor(totalMinutes / 60);
    const remainingMinutes = totalMinutes % 60;

    return {
      totalWorkouts,
      totalRounds,
      totalTime: totalHours > 0 ? `${totalHours}h ${remainingMinutes}m` : `${totalMinutes}m`,
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

    Alert.alert(
      'Clear All Logs',
      'Are you sure you want to clear all completed routines? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear All',
          style: 'destructive',
          onPress: () => {
            clearCompletedRoutines();
            setIsEditMode(false);
          },
        },
      ],
    );
  }, [completedRoutines.length, clearCompletedRoutines]);

  const toggleEditMode = useCallback(() => {
    if (!hasLogs && !isEditMode) return;
    setIsEditMode((prev) => !prev);
  }, [hasLogs, isEditMode]);

  const handleDeleteLog = useCallback(
    (log) => {
      Alert.alert(
        'Delete Entry',
        `Remove "${log.name}" from your workout log?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: () => {
              removeCompletedRoutine(log.id, log.completedAt);
              if (selectedLog && selectedLog.completedAt === log.completedAt) {
                setSelectedLog(null);
              }
            },
          },
        ],
        { cancelable: true },
      );
    },
    [removeCompletedRoutine, selectedLog],
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
    setSelectedLog(completed);
    setShowDetailModal(true);
  }, []);

  const handlePublish = useCallback(() => {
    if (!selectedLog) return;
    setShowDetailModal(false);
    setShowPublishModal(true);
  }, [selectedLog]);

  const confirmPublish = useCallback(() => {
    if (!selectedLog) return;

    const newPost = {
      id: `post-${Date.now()}`,
      authorId: 'current-user',
      authorName: 'You',
      routine: {
        id: selectedLog.id,
        name: selectedLog.name,
        rounds: selectedLog.rounds,
        workSec: selectedLog.workSec,
        restSec: selectedLog.restSec,
        description: selectedLog.description || '',
        workoutPlaylistId: selectedLog.workoutPlaylistId,
        restPlaylistId: selectedLog.restPlaylistId,
      },
      type: 'completed',
      category: publishCategory,
      caption: publishCaption.trim() || `Just completed ${selectedLog.name}! 💪`,
      createdAt: new Date().toISOString(),
      likes: 0,
      liked: false,
      upvotes: 0,
      downvotes: 0,
      userVote: 0,
    };

    addPost(newPost);
    setShowPublishModal(false);
    setSelectedLog(null);
    setPublishCaption('');
    setPublishCategory('sport');
    Alert.alert('Success', 'Your workout has been published!');
  }, [addPost, publishCaption, publishCategory, selectedLog]);

  const generateShareImages = useCallback(async () => {
    if (!selectedLog || !shareCardRef.current || !shareCardTransparentRef.current) {
      setTimeout(() => {
        generateShareImages();
      }, 100);
      return;
    }

    try {
      setIsGenerating(true);

      const [fullImageUri, transparentImageUri] = await Promise.all([
        shareCardRef.current.capture({
          format: 'png',
          quality: 1.0,
          result: 'data-uri',
        }),
        shareCardTransparentRef.current.capture({
          format: 'png',
          quality: 1.0,
          result: 'data-uri',
        }),
      ]);

      setGeneratedImages({
        full: fullImageUri,
        transparent: transparentImageUri,
      });

      setIsGenerating(false);
      setShowShareModal(true);
    } catch (error) {
      console.error('Error generating images:', error);
      setIsGenerating(false);
      Alert.alert('Error', 'Failed to generate images. Please try again.');
    }
  }, [selectedLog]);

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
        const base64 = imageUri.replace(/^data:image\/\w+;base64,/, '');
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
        const base64 = imageUri.replace(/^data:image\/\w+;base64,/, '');

        if (platform === 'native') {
          await Share.share({
            message: `Just completed ${selectedLog.name}! 💪`,
            title: `Workout: ${selectedLog.name}`,
          });
        } else if (platform === 'instagram-story' || platform === 'instagram-messages') {
          await Clipboard.setImageAsync(base64);
          Alert.alert('Copied!', 'Image copied to clipboard. Open Instagram and paste it!');
        } else if (platform === 'whatsapp' || platform === 'facebook' || platform === 'message') {
          await Clipboard.setImageAsync(base64);
          Alert.alert('Copied!', 'Image copied to clipboard. Open the app and paste it!');
        } else if (platform === 'copy-link') {
          const workoutText = `Just completed ${selectedLog.name}! 💪\n${selectedLog.rounds} rounds • ${selectedLog.workSec}s work / ${selectedLog.restSec}s rest`;
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


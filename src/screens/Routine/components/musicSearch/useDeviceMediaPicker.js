import { useCallback, useEffect, useRef, useState } from 'react';
import { persistLocalMedia, mediaDirectory } from '../../../../lib/localMedia';
import { Alert } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import {
  WEB_MEDIA_IMPORT_AVAILABLE,
  WEB_MEDIA_IMPORT_UNAVAILABLE_MESSAGE,
} from '../../../../services/mediaImport/config';
import {
  AUDIO_MIME_TYPES,
  VIDEO_MIME_TYPES,
  VIDEO_FILE_EXTENSIONS,
  createSongObject,
} from './constants';

/**
 * Encapsulates "pick / download / stream local media" flows used by the
 * music search modal. The modal stays focused on rendering and platform
 * orchestration; this hook owns the async side effects against
 * DocumentPicker / ImagePicker / FileSystem and returns a single
 * `isDownloading` flag for spinner UX.
 *
 * @param {Object} params
 * @param {(song: Object) => void} params.onSongSelected - called once a
 *   normalized song object is ready. The modal uses this to attach the
 *   song to the current round and dismiss itself.
 */
export const useDeviceMediaPicker = ({ onSongSelected, active = true }) => {
  const [isDownloading, setIsDownloading] = useState(false);
  const requestVersion = useRef(0);
  useEffect(() => {
    requestVersion.current++;
    return () => {
      requestVersion.current++;
    };
  }, [active]);

  /** Download a remote file to the cache dir and emit a song object. */
  const downloadFromUrl = useCallback(
    async (url, name) => {
      if (!WEB_MEDIA_IMPORT_AVAILABLE) {
        Alert.alert('Import from Files', WEB_MEDIA_IMPORT_UNAVAILABLE_MESSAGE);
        return false;
      }
      const ticket = requestVersion.current;
      try {
        setIsDownloading(true);
        const filename = name || url.split('/').pop().split('?')[0] || 'audio';
        const ext = url.split('.').pop()?.split('?')[0]?.toLowerCase() || 'mp3';
        const safeFilename = `${filename.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.${ext}`;
        await FileSystem.makeDirectoryAsync(mediaDirectory(), { intermediates: true });
        const fileUri = mediaDirectory() + safeFilename;

        const result = await FileSystem.downloadAsync(url, fileUri);

        if (ticket !== requestVersion.current) return;
        if (result?.uri && result.status === 200) {
          onSongSelected(
            createSongObject({
              name: filename.replace(/\.[^/.]+$/, ''),
              artist: 'Downloaded',
              uri: result.uri,
              source: 'device',
            }),
          );
        } else {
          throw new Error('Download failed');
        }
      } catch (error) {
        Alert.alert('Download failed', 'The file could not be downloaded.');
      } finally {
        setIsDownloading(false);
      }
    },
    [onSongSelected],
  );

  /** Stream a remote file directly without copying it locally. */
  const addFromUrl = useCallback(
    (url, name) => {
      if (!WEB_MEDIA_IMPORT_AVAILABLE) {
        Alert.alert('Import from Files', WEB_MEDIA_IMPORT_UNAVAILABLE_MESSAGE);
        return false;
      }
      const filename = name || url.split('/').pop().split('?')[0] || 'Audio';
      onSongSelected(
        createSongObject({
          name: filename.replace(/\.[^/.]+$/, ''),
          artist: 'Web Audio',
          uri: url,
          source: 'url',
        }),
      );
    },
    [onSongSelected],
  );

  /** Choice prompt shown when the user taps a media row inside the WebView. */
  const handleMediaClick = useCallback(
    (media) => {
      if (!WEB_MEDIA_IMPORT_AVAILABLE) {
        Alert.alert('Import from Files', WEB_MEDIA_IMPORT_UNAVAILABLE_MESSAGE);
        return false;
      }
      Alert.alert(media.name, 'How would you like to add this file?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Play from URL', onPress: () => addFromUrl(media.url, media.name) },
        { text: 'Download', onPress: () => downloadFromUrl(media.url, media.name) },
      ]);
    },
    [addFromUrl, downloadFromUrl],
  );

  /** Pick any audio/video file from Files. */
  const handlePickFile = useCallback(async () => {
    const ticket = requestVersion.current;
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [...AUDIO_MIME_TYPES, ...VIDEO_MIME_TYPES],
        copyToCacheDirectory: true,
      });

      if (ticket !== requestVersion.current) return;
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const file = result.assets[0];
        const fileName = file.name || 'Unknown';
        const extension = fileName.split('.').pop()?.toLowerCase() || '';
        const isVideo = VIDEO_FILE_EXTENSIONS.includes(extension);

        const persistentUri = await persistLocalMedia(file.uri, fileName);
        if (ticket !== requestVersion.current) return;
        onSongSelected(
          createSongObject({
            name: fileName.replace(/\.[^/.]+$/, ''),
            artist: isVideo ? 'Video File' : 'Local File',
            uri: persistentUri,
            source: 'device',
            isVideo,
          }),
        );
      }
    } catch (error) {
      console.error('Error picking file:', error);
      Alert.alert('Error', 'Failed to pick file');
    }
  }, [onSongSelected]);

  /** Pick an audio file the user labels as a "voice memo". */
  const handlePickVoiceMemo = useCallback(async () => {
    const ticket = requestVersion.current;
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: AUDIO_MIME_TYPES,
        copyToCacheDirectory: true,
      });

      if (ticket !== requestVersion.current) return;
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const file = result.assets[0];
        const fileName = file.name || 'Voice Memo';
        const persistentUri = await persistLocalMedia(file.uri, fileName);
        if (ticket !== requestVersion.current) return;
        onSongSelected(
          createSongObject({
            name: fileName.replace(/\.[^/.]+$/, ''),
            artist: 'Voice Memo',
            uri: persistentUri,
            source: 'device',
          }),
        );
      }
    } catch (error) {
      console.error('Error picking voice memo:', error);
      Alert.alert('Error', 'Failed to pick voice memo');
    }
  }, [onSongSelected]);

  /** Pick a video from the camera roll / Photos library. */
  const handlePickFromCameraRoll = useCallback(async () => {
    const ticket = requestVersion.current;
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permission Required',
          'Please allow access to your photo library to select videos.',
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Videos,
        allowsEditing: false,
        quality: 1,
      });

      if (ticket !== requestVersion.current) return;
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const video = result.assets[0];
        const uriParts = video.uri.split('/');
        const fileName = uriParts[uriParts.length - 1] || `Video_${Date.now()}`;

        const persistentUri = await persistLocalMedia(video.uri, fileName);
        if (ticket !== requestVersion.current) return;
        onSongSelected(
          createSongObject({
            name: fileName.replace(/\.[^/.]+$/, ''),
            artist: 'Camera Roll',
            duration: video.duration ? Math.floor(video.duration / 1000) : 0,
            uri: persistentUri,
            source: 'device',
            isVideo: true,
          }),
        );
      }
    } catch (error) {
      console.error('Error picking from camera roll:', error);
      Alert.alert('Error', 'Failed to pick video from camera roll');
    }
  }, [onSongSelected]);

  return {
    isDownloading,
    downloadFromUrl,
    addFromUrl,
    handleMediaClick,
    handlePickFile,
    handlePickVoiceMemo,
    handlePickFromCameraRoll,
  };
};

import { useEffect, useState } from 'react';
import { Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import storage, { STORAGE_KEYS } from '../../../lib/storage';
import { persistLocalMedia } from '../../../lib/localMedia';

export default function useProfileData() {
  const [picture, setPicture] = useState(null);
  const [bio, setBio] = useState('');
  const [links, setLinks] = useState({ instagram: '', twitter: '', tiktok: '', youtube: '' });
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      storage.getString(STORAGE_KEYS.PROFILE_PICTURE_URI),
      storage.getString(STORAGE_KEYS.PROFILE_BIO),
      storage.getJSON(STORAGE_KEYS.PROFILE_SOCIAL_LINKS, {}),
    ]).then(([uri, text, social]) => {
      if (cancelled) return;
      setPicture(uri);
      setBio(text || '');
      setLinks((prev) => ({ ...prev, ...social }));
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  const save = async () => {
    const ok =
      (await storage.setString(STORAGE_KEYS.PROFILE_BIO, bio)) &&
      (await storage.setJSON(STORAGE_KEYS.PROFILE_SOCIAL_LINKS, links));
    if (!ok) Alert.alert('Could not save profile', 'Please try again.');
    return ok;
  };
  const pick = async (camera) => {
    try {
      if (camera) {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          Alert.alert('Camera access needed', 'Allow camera access in Settings to take a photo.');
          return;
        }
      }
      const options = { mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.8 };
      const result = await (camera
        ? ImagePicker.launchCameraAsync(options)
        : ImagePicker.launchImageLibraryAsync(options));
      if (result.canceled) return;
      const uri = await persistLocalMedia(result.assets[0].uri, 'profile.jpg');
      if (!(await storage.setString(STORAGE_KEYS.PROFILE_PICTURE_URI, uri)))
        throw new Error('save');
      setPicture(uri);
    } catch {
      Alert.alert('Could not update photo', 'Please choose another photo and try again.');
    }
  };
  const changePicture = () =>
    Alert.alert('Profile photo', 'Choose a photo source.', [
      { text: 'Camera', onPress: () => pick(true) },
      { text: 'Photo library', onPress: () => pick(false) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  return { picture, bio, setBio, links, setLinks, ready, save, changePicture };
}

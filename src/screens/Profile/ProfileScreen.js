import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, TextInput, Modal, Alert, ActivityIndicator, Image } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import storage, { STORAGE_KEYS } from '../../lib/storage';
import * as AuthSession from 'expo-auth-session';
import * as Linking from 'expo-linking';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import { useRoutineContext } from '../../context/RoutineContext';
import { usePostContext } from '../../context/PostContext';
import { usePlatformContext, PLATFORMS } from '../../context/PlatformContext';
import { useTheme } from '../../context/ThemeContext';
import { createScreenStyles } from '../../styles/screenStyles';
import ScreenWrapper from '../../components/common/ScreenWrapper';
import useConfirm from '../../hooks/useConfirm';
import { SPOTIFY_CLIENT_ID, SPOTIFY_REDIRECT_URI, SPOTIFY_SCOPES } from '../../services/spotify/config';
import { computeAccessTokenExpiresAt } from '../../services/spotify/auth';
import { formatTimeAgo } from '../../utils/timeFormatters';
import SpotifyLogo from './components/SpotifyLogo';

const SettingRow = ({
  icon,
  label,
  onPress,
  showDivider = true,
  iconColor,
  labelColor,
  rightContent,
  disabled = false,
  theme,
}) => (
  <TouchableOpacity
    onPress={onPress}
    activeOpacity={0.7}
    disabled={disabled}
    style={{
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: theme.spacing.lg,
      borderBottomWidth: showDivider ? 1 : 0,
      borderBottomColor: theme.border,
      opacity: disabled ? 1 : 1,
    }}
  >
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <Ionicons name={icon} size={22} color={iconColor || theme.iconPrimary} style={{ marginRight: theme.spacing.md }} />
      <Text style={{ fontSize: theme.fontSize.md, fontWeight: theme.fontWeight.semibold, color: labelColor || theme.text }}>
        {label}
      </Text>
    </View>
    {rightContent || <Ionicons name="chevron-forward" size={20} color={theme.iconTertiary} />}
  </TouchableOpacity>
);

const ThemeToggle = ({ isOn, theme }) => {
  const trackBackground = isOn
    ? 'rgba(6, 182, 212, 0.25)'
    : theme.isDark
      ? 'rgba(255, 255, 255, 0.12)'
      : theme.borderLight;
  const trackBorder = isOn ? theme.accent : theme.border;

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}>
      <Ionicons
        name="sunny-outline"
        size={14}
        color={isOn ? theme.textSecondary : theme.iconSecondary}
        style={{ opacity: isOn ? 0.6 : 1 }}
      />
      <View
        style={{
          width: 58,
          height: 30,
          borderRadius: 15,
          padding: 3,
          backgroundColor: trackBackground,
          borderWidth: 1,
          borderColor: trackBorder,
          justifyContent: 'center',
          position: 'relative',
        }}
      >
        <View
          style={{
            position: 'absolute',
            top: 3,
            left: isOn ? 31 : 3,
            width: 24,
            height: 24,
            borderRadius: 12,
            backgroundColor: theme.card,
            justifyContent: 'center',
            alignItems: 'center',
            shadowColor: '#000',
            shadowOpacity: 0.2,
            shadowRadius: 3,
            shadowOffset: { width: 0, height: 1 },
            elevation: 3,
          }}
        >
          <Ionicons
            name={isOn ? 'moon' : 'sunny'}
            size={14}
            color={isOn ? theme.accent : theme.iconSecondary}
          />
        </View>
      </View>
      <Ionicons
        name="moon"
        size={14}
        color={isOn ? theme.accent : theme.iconSecondary}
        style={{ opacity: isOn ? 1 : 0.6 }}
      />
    </View>
  );
};

export default function ProfileScreen({ navigation }) {
  const { routines, completedRoutines, resetRoutinesToDefaults } = useRoutineContext();
  const { posts, addPost, deletePost, clearAllPosts } = usePostContext();
  const { theme, isDark, toggleTheme, setTheme } = useTheme();
  const confirm = useConfirm();
  const screenStyles = createScreenStyles({ ...theme, isDark });
  const [isLoading, setIsLoading] = useState(false);
  const [showPostModal, setShowPostModal] = useState(false);
  const [selectedRoutineForPost, setSelectedRoutineForPost] = useState(null);
  const [postCaption, setPostCaption] = useState('');
  const [postType, setPostType] = useState('new'); // 'new' or 'completed'
  const [postCategory, setPostCategory] = useState('sport'); // 'sport', 'learn', or 'study'
  const { connectedPlatforms, connectPlatform, disconnectPlatform, isPlatformConnected, PLATFORMS: PLATFORM_MAP } = usePlatformContext();
  const [connectingPlatform, setConnectingPlatform] = useState(null);
  const connectingTimeoutRef = React.useRef(null);
  const [showShortcutsModal, setShowShortcutsModal] = useState(false);
  const [showNotificationsModal, setShowNotificationsModal] = useState(false);
  const [showUnitsModal, setShowUnitsModal] = useState(false);
  const [showAboutModal, setShowAboutModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false); // Track login state
  const [notificationSettings, setNotificationSettings] = useState({
    workoutReminders: true,
    completionAlerts: true,
    weeklySummary: false,
  });
  const [unitPreference, setUnitPreference] = useState('metric'); // 'metric' or 'imperial'
  const [profilePictureUri, setProfilePictureUri] = useState(null);
  const [bio, setBio] = useState('');
  const [socialLinks, setSocialLinks] = useState({
    instagram: '',
    twitter: '',
    tiktok: '',
    youtube: '',
  });
  const [showEditProfileModal, setShowEditProfileModal] = useState(false);

  // Filter posts by current user (for now, all posts are shown)
  const myPosts = posts.filter(post => post.authorId === 'current-user');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [savedUri, savedBio, savedSocialLinks] = await Promise.all([
        storage.getString(STORAGE_KEYS.PROFILE_PICTURE_URI),
        storage.getString(STORAGE_KEYS.PROFILE_BIO),
        storage.getJSON(STORAGE_KEYS.PROFILE_SOCIAL_LINKS, null),
      ]);
      if (cancelled) return;
      if (savedUri) setProfilePictureUri(savedUri);
      if (savedBio) setBio(savedBio);
      if (savedSocialLinks && typeof savedSocialLinks === 'object') {
        setSocialLinks(savedSocialLinks);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSaveProfile = async () => {
    const ok =
      (await storage.setString(STORAGE_KEYS.PROFILE_BIO, bio)) &&
      (await storage.setJSON(STORAGE_KEYS.PROFILE_SOCIAL_LINKS, socialLinks));
    if (!ok) {
      Alert.alert('Error', 'Failed to save profile. Please try again.');
      return;
    }
    setShowEditProfileModal(false);
    Alert.alert('Success', 'Profile updated successfully!');
  };

  const handleSocialLinkChange = (platform, value) => {
    setSocialLinks(prev => ({
      ...prev,
      [platform]: value,
    }));
  };

  const openSocialLink = (platform, url) => {
    if (!url) return;
    let formattedUrl = url;
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      formattedUrl = `https://${url}`;
    }
    Linking.openURL(formattedUrl).catch(err => {
      console.error('Error opening link:', err);
      Alert.alert('Error', 'Could not open link. Please check the URL.');
    });
  };

  // Request permissions for image picker
  useEffect(() => {
    (async () => {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Sorry, we need camera roll permissions to change your profile picture!');
      }
    })();
  }, []);

  const handleChangeProfilePicture = () => {
    Alert.alert(
      'Change Profile Picture',
      'Choose an option',
      [
        {
          text: 'Camera',
          onPress: () => pickImage('camera'),
        },
        {
          text: 'Photo Library',
          onPress: () => pickImage('library'),
        },
        {
          text: 'Cancel',
          style: 'cancel',
        },
      ]
    );
  };

  const pickImage = async (source) => {
    try {
      let result;
      
      if (source === 'camera') {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission needed', 'Sorry, we need camera permissions to take a photo!');
          return;
        }
        result = await ImagePicker.launchCameraAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          allowsEditing: true,
          aspect: [1, 1],
          quality: 0.8,
        });
      } else {
        result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          allowsEditing: true,
          aspect: [1, 1],
          quality: 0.8,
        });
      }

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const uri = result.assets[0].uri;
        setProfilePictureUri(uri);
        await storage.setString(STORAGE_KEYS.PROFILE_PICTURE_URI, uri);
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert('Error', 'Failed to pick image. Please try again.');
    }
  };

  const performHardLogout = async () => {
    // 1. Disconnect every connected music platform (Spotify token revoke is
    //    not possible from the client, but we forget the token locally).
    Object.keys(connectedPlatforms || {}).forEach((platformId) => {
      // 'device' isn't really a connected account, leave it.
      if (platformId === 'device') return;
      try { disconnectPlatform(platformId); } catch (e) { /* swallow */ }
    });

    // 2. Reset routines + workout history to factory defaults.
    resetRoutinesToDefaults();

    // 3. Wipe social posts.
    clearAllPosts();

    // 4. Reset theme to light.
    try { await setTheme('light'); } catch (e) { /* swallow */ }

    // 5. Wipe profile-specific keys + auth token leftovers.
    await storage.removeMany([
      STORAGE_KEYS.PROFILE_PICTURE_URI,
      STORAGE_KEYS.PROFILE_BIO,
      STORAGE_KEYS.PROFILE_SOCIAL_LINKS,
      STORAGE_KEYS.USER_TOKEN,
    ]);

    // 6. Reset local screen state so the UI updates immediately.
    setProfilePictureUri(null);
    setBio('');
    setSocialLinks({ instagram: '', twitter: '', tiktok: '', youtube: '' });
    setIsLoggedIn(false);
  };

  const handleLogout = () => {
    confirm({
      title: 'Log Out',
      message:
        'This will sign you out and remove your local data: connected music platforms, profile info, posts, custom routines, workout history, and theme. This cannot be undone.',
      confirmLabel: 'Log Out',
      destructive: true,
      onConfirm: async () => {
        try {
          await performHardLogout();
          Alert.alert('Logged Out', 'Your local data has been cleared.');
        } catch (error) {
          console.error('Logout failed:', error);
          Alert.alert('Logout failed', 'Some data could not be cleared. Please try again.');
        }
      },
    });
  };

  const handleAccountAccess = () => {
    if (isLoggedIn) {
      Alert.alert('Manage Account', 'Account settings will be available here soon.');
      return;
    }

    Alert.alert(
      'Sign In',
      'Choose how you want to sign in to SyncApp.',
      [
        { text: 'Google', onPress: handleGoogleSignIn },
        { text: 'Apple', onPress: handleAppleSignIn },
        { text: 'Facebook', onPress: handleFacebookSignIn },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  const handleUpgradePress = () => {
    Alert.alert(
      'Upgrade to Pro',
      'Premium plans with custom coaching and insights are coming soon.'
    );
  };
  
  const handleCreatePost = () => {
    setShowPostModal(true);
  };

  const handlePostRoutine = () => {
    if (!selectedRoutineForPost) {
      Alert.alert('Select Routine', 'Please select a routine to post');
      return;
    }

    const newPost = {
      id: `post-${Date.now()}`,
      authorId: 'current-user',
      authorName: 'You', // TODO: Get from auth
      routine: selectedRoutineForPost,
      type: postType,
      category: postCategory,
      caption: postCaption,
      createdAt: new Date().toISOString(),
      likes: 0,
      liked: false,
      upvotes: 0,
      downvotes: 0,
      userVote: 0,
    };

    addPost(newPost);
    setShowPostModal(false);
    setSelectedRoutineForPost(null);
    setPostCaption('');
    setPostCategory('sport');
    Alert.alert('Success', 'Your routine has been shared!');
  };

  // Spotify OAuth request (using Authorization Code flow with PKCE)
  const [spotifyRequest, spotifyResponse, spotifyPromptAsync] = AuthSession.useAuthRequest(
    {
      clientId: SPOTIFY_CLIENT_ID,
      scopes: SPOTIFY_SCOPES.split(' '),
      usePKCE: true,
      redirectUri: SPOTIFY_REDIRECT_URI,
      responseType: AuthSession.ResponseType.Code,
    },
    {
      authorizationEndpoint: 'https://accounts.spotify.com/authorize',
      tokenEndpoint: 'https://accounts.spotify.com/api/token',
    }
  );

  // Handle Spotify OAuth response (Authorization Code flow)
  useEffect(() => {
    if (spotifyResponse?.type === 'success' && spotifyResponse.params.code && connectingPlatform === 'spotify') {
      const exchangeCodeForToken = async () => {
        try {
          if (!spotifyRequest?.codeVerifier) {
            setConnectingPlatform(null);
            Alert.alert('Spotify Connection Failed', 'PKCE code verifier missing. Please try again.');
            return;
          }
          
          // Exchange authorization code for access token
          const params = new URLSearchParams({
            grant_type: 'authorization_code',
            code: spotifyResponse.params.code,
            redirect_uri: SPOTIFY_REDIRECT_URI,
            client_id: SPOTIFY_CLIENT_ID,
            code_verifier: spotifyRequest.codeVerifier,
          });
          
          const tokenResponse = await fetch('https://accounts.spotify.com/api/token', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: params.toString(),
          });
          
          const tokenData = await tokenResponse.json();
          
          if (tokenData.error) {
            console.error('Spotify token error:', tokenData);
            setConnectingPlatform(null);
            Alert.alert(
              'Spotify Connection Failed',
              `Error: ${tokenData.error_description || tokenData.error}\n\nMake sure the redirect URI in your Spotify dashboard matches exactly:\n${SPOTIFY_REDIRECT_URI}`
            );
            return;
          }
          
          if (tokenData.access_token) {
            // Update platform context
            const expiresAt = computeAccessTokenExpiresAt(tokenData.expires_in);
            connectPlatform('spotify', {
              accessToken: tokenData.access_token,
              refreshToken: tokenData.refresh_token,
              expiresAt,
            });
            setConnectingPlatform(null);
            // Clear timeout
            if (connectingTimeoutRef.current) {
              clearTimeout(connectingTimeoutRef.current);
              connectingTimeoutRef.current = null;
            }
            Alert.alert('Success', 'Successfully connected to Spotify!');
          } else {
            setConnectingPlatform(null);
            if (connectingTimeoutRef.current) {
              clearTimeout(connectingTimeoutRef.current);
              connectingTimeoutRef.current = null;
            }
            Alert.alert('Spotify Connection Failed', 'No access token received. Please try again.');
          }
        } catch (error) {
          console.error('Spotify token exchange error:', error);
          setConnectingPlatform(null);
          if (connectingTimeoutRef.current) {
            clearTimeout(connectingTimeoutRef.current);
            connectingTimeoutRef.current = null;
          }
          Alert.alert('Spotify Connection Failed', `Error: ${error.message || 'Unknown error'}`);
        }
      };
      exchangeCodeForToken();
    }
  }, [spotifyResponse, spotifyRequest, connectingPlatform, connectPlatform]);

  // Handle OAuth errors
  useEffect(() => {
    if (spotifyResponse?.type === 'error' && connectingPlatform === 'spotify') {
      setConnectingPlatform(null);
      // Clear timeout
      if (connectingTimeoutRef.current) {
        clearTimeout(connectingTimeoutRef.current);
        connectingTimeoutRef.current = null;
      }
      const errorDescription = spotifyResponse.params?.error_description || spotifyResponse.error?.message || 'Unknown error';
      console.error('Spotify OAuth error:', spotifyResponse);
      Alert.alert(
        'Spotify Connection Failed',
        `Could not connect to Spotify.\n\nError: ${errorDescription}\n\nMake sure:\n1. Your Client ID is correct\n2. The redirect URI matches exactly in Spotify dashboard\n3. You selected "Web API" in Spotify app settings`
      );
    }
  }, [spotifyResponse, connectingPlatform]);

  // Handle OAuth cancellation/dismissal
  useEffect(() => {
    if (connectingPlatform === 'spotify' && spotifyResponse) {
      // Handle cases where user cancels or dismisses the OAuth flow
      if (spotifyResponse.type === 'dismiss' || spotifyResponse.type === 'cancel' || spotifyResponse.type === 'locked') {
        setConnectingPlatform(null);
        // Clear timeout if it exists
        if (connectingTimeoutRef.current) {
          clearTimeout(connectingTimeoutRef.current);
          connectingTimeoutRef.current = null;
        }
        // Don't show alert for user-initiated cancellation
        if (spotifyResponse.type !== 'dismiss') {
          console.log('Spotify OAuth cancelled by user');
        }
      }
    }
  }, [spotifyResponse, connectingPlatform]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (connectingTimeoutRef.current) {
        clearTimeout(connectingTimeoutRef.current);
      }
    };
  }, []);

  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    // TODO: Implement Google OAuth
    setTimeout(() => {
      setIsLoading(false);
      alert('Google sign-in would be implemented here');
    }, 1000);
  };

  const handleAppleSignIn = async () => {
    setIsLoading(true);
    // TODO: Implement Apple OAuth
    setTimeout(() => {
      setIsLoading(false);
      alert('Apple sign-in would be implemented here');
    }, 1000);
  };

  const handleFacebookSignIn = async () => {
    setIsLoading(true);
    // TODO: Implement Facebook OAuth
    setTimeout(() => {
      setIsLoading(false);
      alert('Facebook sign-in would be implemented here');
    }, 1000);
  };

  const sectionLabelStyle = {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.semibold,
    color: theme.textSecondary,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  };

  return (
    <ScreenWrapper style={screenStyles.container}>
    <ScrollView 
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: theme.spacing.xl, paddingTop: theme.spacing['2xl'], paddingBottom: theme.spacing['4xl'] }}
      >
        {/* Profile Header */}
        <View style={{ alignItems: 'center', paddingVertical: theme.spacing['2xl'], borderBottomWidth: 1, borderBottomColor: theme.border, marginBottom: theme.spacing['2xl'] }}>
          <View style={{ position: 'relative', marginBottom: theme.spacing.md }}>
            <TouchableOpacity
              onPress={handleChangeProfilePicture}
              activeOpacity={0.9}
              style={{
                width: 100,
                height: 100,
                borderRadius: 50,
            backgroundColor: theme.isDark ? 'rgba(6, 182, 212, 0.2)' : '#e0d7ff',
            alignItems: 'center',
            justifyContent: 'center',
                overflow: 'hidden',
                borderWidth: 3,
                borderColor: theme.card,
                ...theme.shadow.lg,
              }}
            >
              {profilePictureUri ? (
                <Image
                  source={{ uri: profilePictureUri }}
                  style={{
                    width: 100,
                    height: 100,
                    borderRadius: 50,
                  }}
                />
              ) : (
                <Ionicons name="person" size={50} color={theme.accent} />
              )}
            </TouchableOpacity>
            {/* Edit badge - always visible */}
            <TouchableOpacity
              onPress={handleChangeProfilePicture}
              activeOpacity={0.8}
              style={{
                position: 'absolute',
                bottom: -2,
                right: -2,
                width: 36,
                height: 36,
                borderRadius: 18,
                backgroundColor: theme.accent,
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: 3,
                borderColor: theme.card,
                shadowColor: theme.accent,
                shadowOffset: { width: 0, height: 3 },
                shadowOpacity: 0.4,
                shadowRadius: 6,
                elevation: 6,
              }}
            >
              <Ionicons name="camera" size={18} color={theme.textInverse} />
            </TouchableOpacity>
          </View>
          <Text style={{ fontSize: theme.fontSize['2xl'], fontWeight: theme.fontWeight.bold, color: theme.text, marginBottom: theme.spacing.xs }}>
            Your Profile
      </Text>
          
          {/* Bio Section */}
          {bio ? (
            <Text style={{ fontSize: theme.fontSize.base, color: theme.textSecondary, textAlign: 'center', marginTop: theme.spacing.sm, marginBottom: theme.spacing.lg, paddingHorizontal: theme.spacing.xl }}>
              {bio}
            </Text>
          ) : null}

          {/* Social Media Links */}
          {(socialLinks.instagram || socialLinks.twitter || socialLinks.tiktok || socialLinks.youtube) && (
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 8, marginBottom: 16, flexWrap: 'wrap', justifyContent: 'center' }}>
              {socialLinks.instagram && (
                <TouchableOpacity
                  onPress={() => openSocialLink('instagram', socialLinks.instagram)}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    backgroundColor: '#E4405F',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Ionicons name="logo-instagram" size={20} color="#ffffff" />
                </TouchableOpacity>
              )}
              {socialLinks.twitter && (
                <TouchableOpacity
                  onPress={() => openSocialLink('twitter', socialLinks.twitter)}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    backgroundColor: '#1DA1F2',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Ionicons name="logo-twitter" size={20} color="#ffffff" />
                </TouchableOpacity>
              )}
              {socialLinks.tiktok && (
                <TouchableOpacity
                  onPress={() => openSocialLink('tiktok', socialLinks.tiktok)}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    backgroundColor: '#000000',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Ionicons name="logo-tiktok" size={20} color="#ffffff" />
                </TouchableOpacity>
              )}
              {socialLinks.youtube && (
                <TouchableOpacity
                  onPress={() => openSocialLink('youtube', socialLinks.youtube)}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    backgroundColor: '#FF0000',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Ionicons name="logo-youtube" size={20} color="#ffffff" />
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* Edit Profile Button */}
          <TouchableOpacity
            onPress={() => setShowEditProfileModal(true)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              marginTop: theme.spacing.sm,
              paddingHorizontal: theme.spacing.lg,
              paddingVertical: theme.spacing.sm,
              borderRadius: 8,
              backgroundColor: theme.cardSecondary,
              borderWidth: 1,
              borderColor: theme.border,
            }}
          >
            <Ionicons name="create-outline" size={16} color={theme.iconSecondary} />
            <Text style={{ fontSize: theme.fontSize.base, color: theme.textSecondary, fontWeight: theme.fontWeight.semibold }}>Edit Profile</Text>
          </TouchableOpacity>

          <View style={{ flexDirection: 'row', gap: theme.spacing['2xl'], marginTop: theme.spacing.lg }}>
            <View style={{ alignItems: 'center' }}>
              <Text style={{ fontSize: theme.fontSize.xl, fontWeight: theme.fontWeight.bold, color: theme.text }}>{myPosts.length}</Text>
              <Text style={{ fontSize: theme.fontSize.base, color: theme.textSecondary }}>Posts</Text>
            </View>
            <View style={{ alignItems: 'center' }}>
              <Text style={{ fontSize: theme.fontSize.xl, fontWeight: theme.fontWeight.bold, color: theme.text }}>{routines.length}</Text>
              <Text style={{ fontSize: theme.fontSize.base, color: theme.textSecondary }}>Routines</Text>
            </View>
            <View style={{ alignItems: 'center' }}>
              <Text style={{ fontSize: theme.fontSize.xl, fontWeight: theme.fontWeight.bold, color: theme.text }}>{completedRoutines.length}</Text>
              <Text style={{ fontSize: theme.fontSize.base, color: theme.textSecondary }}>Completed</Text>
            </View>
          </View>
    </View>

        {/* Posts Feed */}
        {myPosts.length === 0 ? (
          <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: theme.spacing['4xl'] }}>
            <Ionicons name="albums-outline" size={64} color={theme.borderDark} />
            <Text style={{ fontSize: theme.fontSize.lg, fontWeight: theme.fontWeight.semibold, color: theme.textSecondary, marginTop: theme.spacing.lg }}>
              No posts yet
            </Text>
            <Text style={{ fontSize: theme.fontSize.base, color: theme.textTertiary, marginTop: theme.spacing.sm, textAlign: 'center' }}>
              Share your first routine to get started!
            </Text>
        <TouchableOpacity
              style={[screenStyles.button, screenStyles.primaryButton, { marginTop: theme.spacing['2xl'] }]}
              onPress={handleCreatePost}
        >
              <Text style={screenStyles.buttonTextPrimary}>Create Post</Text>
        </TouchableOpacity>
          </View>
        ) : (
          myPosts.map((post) => (
            <View
              key={post.id}
              style={{
                backgroundColor: theme.card,
                borderRadius: 16,
                marginBottom: theme.spacing.lg,
                padding: theme.spacing.lg,
                borderWidth: 1,
                borderColor: theme.border,
                ...theme.shadow.sm,
              }}
            >
              {/* Post Header */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: theme.spacing.md }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                  <View style={{
                    width: 40,
                    height: 40,
                    borderRadius: 20,
                    backgroundColor: theme.isDark ? 'rgba(6, 182, 212, 0.2)' : '#e0d7ff',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginRight: theme.spacing.md,
                  }}>
                    <Ionicons name="person" size={20} color={theme.accent} />
      </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: theme.fontWeight.semibold, color: theme.text }}>
                      {post.authorName || 'You'}
                    </Text>
                    <Text style={{ fontSize: theme.fontSize.sm, color: theme.textTertiary }}>
                      {formatTimeAgo(post.createdAt)}
                    </Text>
                  </View>
                </View>
      <TouchableOpacity
                  onPress={() =>
                    confirm({
                      title: 'Delete Post',
                      message: 'Are you sure you want to delete this post?',
                      confirmLabel: 'Delete',
                      destructive: true,
                      onConfirm: () => deletePost(post.id),
                    })
                  }
                  accessibilityRole="button"
                  accessibilityLabel="Delete post"
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="trash-outline" size={20} color={theme.error} />
      </TouchableOpacity>
      </View>

              {/* Routine Info */}
              <View style={{ marginBottom: theme.spacing.md }}>
                <Text style={{ fontSize: theme.fontSize.xl, fontWeight: theme.fontWeight.bold, color: theme.text, marginBottom: theme.spacing.sm }}>
                  {post.routine.name}
        </Text>
                {post.caption && (
                  <Text style={{ fontSize: theme.fontSize.base, color: theme.textSecondary, marginBottom: theme.spacing.md }}>
                    {post.caption}
                  </Text>
                )}
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
                  <View style={[screenStyles.badgeRow, { marginTop: 0, marginBottom: 0 }]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                      <Ionicons name="barbell-outline" size={12} color={theme.iconPrimary} />
                      <Text style={{ color: theme.text, fontSize: theme.fontSize.sm }}>{post.routine.rounds} rounds</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                      <Ionicons name="time-outline" size={12} color={theme.iconPrimary} />
                      <Text style={{ color: theme.text, fontSize: theme.fontSize.sm }}>{post.routine.workSec}s / {post.routine.restSec}s</Text>
                    </View>
                  </View>
                </View>
              </View>

              {/* Post Type Badge */}
              {post.type === 'completed' && (
                <View style={{
                  alignSelf: 'flex-start',
                  backgroundColor: theme.isDark ? 'rgba(59, 130, 246, 0.2)' : '#dbeafe',
                  paddingHorizontal: theme.spacing.sm,
                  paddingVertical: theme.spacing.xs,
                  borderRadius: 6,
                  marginBottom: theme.spacing.md,
                }}>
                  <Text style={{ color: theme.info, fontSize: theme.fontSize.sm, fontWeight: theme.fontWeight.semibold }}>
                    ✓ Completed Workout
        </Text>
                </View>
              )}

              {/* Actions */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xl, paddingTop: theme.spacing.md, borderTopWidth: 1, borderTopColor: theme.borderLight }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons 
                    name={post.liked ? "heart" : "heart-outline"} 
                    size={20} 
                    color={post.liked ? theme.error : theme.iconSecondary} 
                  />
                  <Text style={{ color: theme.textSecondary, fontSize: theme.fontSize.base }}>{post.likes || 0}</Text>
      </View>
              </View>
            </View>
          ))
        )}

        {/* Settings Section */}
        <View style={{ marginTop: theme.spacing['3xl'], paddingTop: theme.spacing['3xl'], borderTopWidth: 1, borderTopColor: theme.border }}>
          <Text style={[screenStyles.signInTitle, { fontSize: theme.fontSize.xl, marginBottom: theme.spacing.lg }]}>Music Platforms</Text>
            
            {[PLATFORMS.spotify].map((platform, index) => {
              const isConnected = isPlatformConnected(platform.id);
              const isConnecting = connectingPlatform === platform.id;
            const borderColor = isConnected
              ? (isDark ? 'rgba(29, 185, 84, 0.45)' : 'rgba(29, 185, 84, 0.35)')
              : theme.border;
            const ctaBg = isConnected
              ? (isDark ? 'rgba(29, 185, 84, 0.25)' : 'rgba(29, 185, 84, 0.12)')
              : theme.cardSecondary;
            const ctaTextColor = isConnected ? platform.color : theme.text;
            const connectedAt =
              connectedPlatforms?.[platform.id]?.connectedAt &&
              new Date(connectedPlatforms[platform.id].connectedAt);
            const subtitle = isConnected && connectedAt
              ? `Linked ${connectedAt.toLocaleDateString()}`
              : 'Secure PKCE connection';
            const description = isConnected
              ? 'Playback stays synced with your workouts.'
              : 'Connect Spotify to keep playlists in sync.';

            return (
              <View
                key={platform.id}
                style={{ paddingHorizontal: theme.spacing.xs, marginBottom: theme.spacing.xs }}
              >
                <TouchableOpacity
                  style={{ borderRadius: 16 }}
                  activeOpacity={0.9}
                  onPress={async () => {
                    if (isConnected) {
                      confirm({
                        title: `Disconnect ${platform.name}?`,
                        message: `Are you sure you want to disconnect from ${platform.name}?`,
                        confirmLabel: 'Disconnect',
                        destructive: true,
                        onConfirm: () => disconnectPlatform(platform.id),
                      });
                    } else {
                      setConnectingPlatform(platform.id);
                      if (SPOTIFY_CLIENT_ID === 'YOUR_SPOTIFY_CLIENT_ID') {
                        Alert.alert(
                          'Spotify Setup Required',
                          'Please configure your Spotify Client ID in App.js. Get it from https://developer.spotify.com/dashboard',
                        );
                        setConnectingPlatform(null);
                        return;
                      }

                      Alert.alert(
                        'Connect Spotify',
                        `Add this redirect URI to your Spotify app settings if you haven't already:\n\n${SPOTIFY_REDIRECT_URI}\n\nClick OK to continue connecting.`,
                        [
                          { text: 'Cancel', style: 'cancel', onPress: () => setConnectingPlatform(null) },
                          {
                            text: 'OK',
                            onPress: async () => {
                              try {
                                if (connectingTimeoutRef.current) {
                                  clearTimeout(connectingTimeoutRef.current);
                                }

                                await spotifyPromptAsync();

                                connectingTimeoutRef.current = setTimeout(() => {
                                  setConnectingPlatform((current) => {
                                    if (current === 'spotify') {
                                      Alert.alert('Connection Timeout', 'The connection attempt timed out. Please try again.');
                                      return null;
                                    }
                                    return current;
                                  });
                                }, 60000);
                              } catch (error) {
                                setConnectingPlatform(null);
                                if (connectingTimeoutRef.current) {
                                  clearTimeout(connectingTimeoutRef.current);
                                  connectingTimeoutRef.current = null;
                                }
                                console.error('Spotify prompt error:', error);
                                Alert.alert('Error', `Failed to connect to Spotify: ${error.message || 'Unknown error'}`);
                              }
                            },
                          },
                        ],
                      );
                    }
                  }}
                  disabled={isConnecting}
                >
                  <View
                    style={[
                      {
                        borderRadius: 16,
                        padding: theme.spacing.xl,
                        borderWidth: 1,
                        borderColor,
                        backgroundColor: theme.card,
                        width: '100%',
                      },
                      theme.shadow.sm,
                    ]}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <View
                        style={{
                          width: 52,
                          height: 52,
                          borderRadius: 26,
                          backgroundColor: isDark ? 'rgba(0, 0, 0, 0.75)' : '#000000',
                          justifyContent: 'center',
                          alignItems: 'center',
                          marginRight: theme.spacing.md,
                        }}
                      >
                        <SpotifyLogo iconSize={26} size={0} showText={false} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text
                          style={{
                            fontSize: theme.fontSize.lg,
                            fontWeight: theme.fontWeight.bold,
                            color: theme.text,
                          }}
                        >
                          {platform.name}
                        </Text>
                        <Text
                          style={{
                            marginTop: 4,
                            fontSize: theme.fontSize.sm,
                            color: theme.textSecondary,
                          }}
                        >
                          {subtitle}
                        </Text>
                      </View>
                      {isConnecting ? (
                        <ActivityIndicator size="small" color={platform.color} />
                      ) : (
                        <View
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            paddingHorizontal: theme.spacing.md,
                            paddingVertical: theme.spacing.sm,
                            backgroundColor: ctaBg,
                            borderRadius: 999,
                            gap: theme.spacing.xs,
                          }}
                        >
                          <Ionicons
                            name={isConnected ? 'checkmark-circle' : 'link-outline'}
                            size={16}
                            color={ctaTextColor}
                          />
                          <Text
                            style={{
                              color: ctaTextColor,
                              fontWeight: theme.fontWeight.semibold,
                              fontSize: theme.fontSize.sm,
                            }}
                          >
                            {isConnected ? 'Connected' : 'Connect'}
                          </Text>
                        </View>
                      )}
                    </View>

                    <Text
                      style={{
                        marginTop: theme.spacing.md,
                        color: theme.textSecondary,
                        fontSize: theme.fontSize.base,
                        lineHeight: 20,
                      }}
                    >
                      {description}
                    </Text>
                  </View>
                </TouchableOpacity>
              </View>
            );
            })}

        {/* Account Settings */}
        <View style={{ marginTop: 32 }}>
          <Text style={sectionLabelStyle}>Account</Text>
          <View style={{ marginTop: theme.spacing.md }}>
            <SettingRow
              icon="person-circle-outline"
              label={isLoggedIn ? 'Manage account' : 'Sign in or create account'}
              onPress={handleAccountAccess}
              theme={theme}
            />
            <SettingRow
              icon="star-outline"
              label="Upgrade to Pro"
              onPress={handleUpgradePress}
              theme={theme}
            />
            <SettingRow
              icon="log-out-outline"
              label="Sign out"
              onPress={handleLogout}
              iconColor={theme.error}
              labelColor={theme.error}
              showDivider={false}
              disabled={!isLoggedIn}
              theme={theme}
            />
          </View>
        </View>

        {/* Quick Settings */}
        <View style={{ marginTop: 32 }}>
          <Text style={sectionLabelStyle}>Quick Settings</Text>
          <View style={{ marginTop: theme.spacing.md }}>
            <SettingRow
              icon={isDark ? "moon" : "moon-outline"}
              label="Dark Mode"
              onPress={toggleTheme}
              theme={theme}
              rightContent={<ThemeToggle isOn={isDark} theme={theme} />}
            />
            <SettingRow
              icon="flash-outline"
              label="Shortcuts"
              onPress={() => setShowShortcutsModal(true)}
              theme={theme}
            />
            <SettingRow
              icon="notifications-outline"
              label="Notifications"
              onPress={() => setShowNotificationsModal(true)}
              theme={theme}
            />
            <SettingRow
              icon="settings-outline"
              label="Units"
              onPress={() => setShowUnitsModal(true)}
              theme={theme}
            />
            <SettingRow
              icon="information-circle-outline"
              label="About"
              onPress={() => setShowAboutModal(true)}
              theme={theme}
            />
            <SettingRow
              icon="options-outline"
              label="Settings"
              onPress={() => setShowSettingsModal(true)}
              theme={theme}
            />
            <SettingRow
              icon="help-circle-outline"
              label="Help & Support"
              onPress={() => setShowHelpModal(true)}
              showDivider={false}
              theme={theme}
            />
          </View>
        </View>
      </View>

    </ScrollView>

      {/* Post Modal */}
      <Modal
        visible={showPostModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowPostModal(false)}
      >
        <View style={{ flex: 1, backgroundColor: theme.modalOverlay, justifyContent: 'flex-end' }}>
          <View style={{
            backgroundColor: theme.modalBackground,
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            padding: theme.spacing.xl,
            maxHeight: '80%',
          }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <Text style={{ fontSize: 20, fontWeight: '700', color: theme.text }}>Create Post</Text>
              <TouchableOpacity onPress={() => setShowPostModal(false)}>
                <Ionicons name="close" size={24} color={theme.iconPrimary} />
              </TouchableOpacity>
            </View>

            <ScrollView>
              {/* Post Type Selector */}
              <View style={{ marginBottom: 20 }}>
                <Text style={{ fontSize: 16, fontWeight: '600', color: theme.text, marginBottom: 12 }}>Post Type</Text>
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <TouchableOpacity
                    style={{
                      flex: 1,
                      padding: theme.spacing.md,
                      borderRadius: 8,
                      backgroundColor: postType === 'new' ? '#e0d7ff' : theme.cardSecondary,
                      borderWidth: 2,
                      borderColor: postType === 'new' ? '#06b6d4' : theme.border,
                    }}
                    onPress={() => setPostType('new')}
                  >
                    <Text style={{ color: postType === 'new' ? '#06b6d4' : theme.textSecondary, fontWeight: '600', textAlign: 'center' }}>
                      New Routine
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={{
                      flex: 1,
                      padding: theme.spacing.md,
                      borderRadius: 8,
                      backgroundColor: postType === 'completed' ? '#dbeafe' : theme.cardSecondary,
                      borderWidth: 2,
                      borderColor: postType === 'completed' ? '#3b82f6' : theme.border,
                    }}
                    onPress={() => setPostType('completed')}
                  >
                    <Text style={{ color: postType === 'completed' ? '#3b82f6' : theme.textSecondary, fontWeight: '600', textAlign: 'center' }}>
                      Completed
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Category Selector */}
              <View style={{ marginBottom: 20 }}>
                <Text style={{ fontSize: 16, fontWeight: '600', color: theme.text, marginBottom: 12 }}>Category</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                  <TouchableOpacity
                    style={{
                      flex: 1,
                      marginRight: 1,
                      padding: theme.spacing.md,
                      borderRadius: 4,
                      backgroundColor: postCategory === 'sport' ? '#fee2e2' : theme.cardSecondary,
                      borderWidth: 2,
                      borderColor: postCategory === 'sport' ? '#ef4444' : theme.border,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                    }}
                    onPress={() => setPostCategory('sport')}
                  >
                    <Ionicons name="barbell-outline" size={16} color={postCategory === 'sport' ? '#ef4444' : theme.textSecondary} />
                    <Text style={{ color: postCategory === 'sport' ? '#ef4444' : theme.textSecondary, fontWeight: '600', textAlign: 'center' }}>
                      Sport
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={{
                      flex: 1,
                      marginHorizontal: 1,
                      padding: theme.spacing.md,
                      borderRadius: 4,
                      backgroundColor: postCategory === 'learn' ? '#dbeafe' : theme.cardSecondary,
                      borderWidth: 2,
                      borderColor: postCategory === 'learn' ? '#3b82f6' : theme.border,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                    }}
                    onPress={() => setPostCategory('learn')}
                  >
                    <Ionicons name="school-outline" size={16} color={postCategory === 'learn' ? '#3b82f6' : theme.textSecondary} />
                    <Text style={{ color: postCategory === 'learn' ? '#3b82f6' : theme.textSecondary, fontWeight: '600', textAlign: 'center' }}>
                      Learn
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={{
                      flex: 1,
                      marginLeft: 1,
                      padding: theme.spacing.md,
                      borderRadius: 4,
                      backgroundColor: postCategory === 'study' ? '#ede9fe' : theme.cardSecondary,
                      borderWidth: 2,
                      borderColor: postCategory === 'study' ? '#06b6d4' : theme.border,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                    }}
                    onPress={() => setPostCategory('study')}
                  >
                    <Ionicons name="book-outline" size={16} color={postCategory === 'study' ? '#06b6d4' : theme.textSecondary} />
                    <Text style={{ color: postCategory === 'study' ? '#06b6d4' : theme.textSecondary, fontWeight: '600', textAlign: 'center' }}>
                      Study
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Routine Selector */}
              <View style={{ marginBottom: 20 }}>
                <Text style={{ fontSize: 16, fontWeight: '600', color: theme.text, marginBottom: 12 }}>Select Routine</Text>
                <ScrollView style={{ maxHeight: 200 }}>
                  {(postType === 'completed' ? completedRoutines : routines).map((routine) => (
                    <TouchableOpacity
                      key={routine.id}
                      style={{
                        padding: theme.spacing.lg,
                        borderRadius: 8,
                        backgroundColor: selectedRoutineForPost?.id === routine.id ? '#e0d7ff' : theme.cardSecondary,
                        marginBottom: 8,
                        borderWidth: 2,
                        borderColor: selectedRoutineForPost?.id === routine.id ? '#06b6d4' : theme.border,
                      }}
                      onPress={() => setSelectedRoutineForPost(routine)}
                    >
                      <Text style={{ fontSize: 16, fontWeight: '600', color: theme.text }}>{routine.name}</Text>
                      <Text style={{ fontSize: 12, color: theme.textSecondary, marginTop: 4 }}>
                        {routine.rounds} rounds • {routine.workSec}s / {routine.restSec}s
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              {/* Caption */}
              <View style={{ marginBottom: 20 }}>
                <Text style={{ fontSize: 16, fontWeight: '600', color: theme.text, marginBottom: 12 }}>Caption (Optional)</Text>
                <TextInput
                  style={{
                    borderWidth: 1,
                    borderColor: theme.border,
                    borderRadius: 8,
                    padding: 12,
                    fontSize: 16,
                    color: theme.text,
                    minHeight: 100,
                    textAlignVertical: 'top',
                  }}
                  placeholder="Add a caption..."
                  placeholderTextColor="#9ca3af"
                  value={postCaption}
                  onChangeText={setPostCaption}
                  multiline
                  numberOfLines={4}
                />
              </View>

              {/* Post Button */}
              <TouchableOpacity
                style={[screenStyles.button, screenStyles.primaryButton, { marginTop: 12 }]}
                onPress={handlePostRoutine}
                disabled={!selectedRoutineForPost}
              >
                <Text style={screenStyles.buttonTextPrimary}>Post Routine</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Shortcuts Modal */}
      <Modal
        visible={showShortcutsModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowShortcutsModal(false)}
      >
        <View style={screenStyles.modalBackdrop}>
          <View style={[screenStyles.modalCard, { maxHeight: '80%' }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <Text style={{ fontSize: 20, fontWeight: '700', color: theme.text }}>Create Shortcut</Text>
              <TouchableOpacity onPress={() => setShowShortcutsModal(false)}>
                <Ionicons name="close" size={24} color={theme.iconPrimary} />
              </TouchableOpacity>
            </View>

            <Text style={{ fontSize: 14, color: theme.textSecondary, marginBottom: 20, lineHeight: 20 }}>
              Create an iOS Shortcut to quickly start a routine. Select a routine below and follow the instructions to add it to your Shortcuts app.
            </Text>

            <ScrollView style={{ maxHeight: 400 }}>
              {routines.length === 0 ? (
                <View style={{ padding: 20, alignItems: 'center' }}>
                  <Ionicons name="flash-outline" size={48} color="#d1d5db" />
                  <Text style={{ fontSize: 16, color: theme.textSecondary, marginTop: 12, textAlign: 'center' }}>
                    No routines available
                  </Text>
                  <Text style={{ fontSize: 14, color: theme.textTertiary, marginTop: 8, textAlign: 'center' }}>
                    Create a routine first to create a shortcut
                  </Text>
                </View>
              ) : (
                routines.map((routine) => {
                  const shortcutUrl = Linking.createURL(`/routine/${routine.id}`);
                  const totalDuration = (routine.rounds || 0) * ((routine.workSec || 0) + (routine.restSec || 0));
                  const minutes = Math.floor(totalDuration / 60);
                  const seconds = totalDuration % 60;
                  const durationLabel = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;

                  return (
                    <TouchableOpacity
                      key={routine.id}
                      style={{
                        padding: theme.spacing.lg,
                        borderRadius: 12,
                        backgroundColor: theme.cardSecondary,
                        borderWidth: 1,
                        borderColor: theme.border,
                        marginBottom: 12,
                      }}
                      onPress={async () => {
                        try {
                          await Clipboard.setStringAsync(shortcutUrl);
                          
                          Alert.alert(
                            'Shortcut URL Copied!',
                            `To create a shortcut:\n\n1. Open the Shortcuts app\n2. Tap the + button\n3. Add "Open URLs" action\n4. Paste the URL (already copied)\n5. Name your shortcut "${routine.name}"\n6. Save and add to Siri`,
                            [
                              { text: 'OK', onPress: () => setShowShortcutsModal(false) }
                            ]
                          );
                        } catch (error) {
                          // Fallback if clipboard is not available
                          Alert.alert(
                            'Create Shortcut',
                            `To create a shortcut for "${routine.name}":\n\n1. Open the Shortcuts app\n2. Tap the + button\n3. Add "Open URLs" action\n4. Enter this URL:\n${shortcutUrl}\n5. Name your shortcut "${routine.name}"\n6. Save and add to Siri`,
                            [
                              { text: 'OK', onPress: () => setShowShortcutsModal(false) }
                            ]
                          );
                        }
                      }}
                    >
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 16, fontWeight: '700', color: theme.text, marginBottom: 4 }}>
                            {routine.name}
                          </Text>
                          <View style={{ flexDirection: 'row', gap: 12, marginTop: 8 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                              <Ionicons name="barbell-outline" size={14} color={theme.iconSecondary} />
                              <Text style={{ fontSize: 12, color: theme.textSecondary }}>{routine.rounds} rounds</Text>
                            </View>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                              <Ionicons name="time-outline" size={14} color={theme.iconSecondary} />
                              <Text style={{ fontSize: 12, color: theme.textSecondary }}>{durationLabel}</Text>
                            </View>
                          </View>
                        </View>
                        <Ionicons name="add-circle-outline" size={24} color="#6d28d9" />
                      </View>
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>

            <View style={{ marginTop: 20, paddingTop: 20, borderTopWidth: 1, borderTopColor: theme.border }}>
              <Text style={{ fontSize: 12, color: theme.textTertiary, textAlign: 'center', lineHeight: 18 }}>
                💡 Tip: After creating the shortcut, you can say "Hey Siri, [shortcut name]" to start your routine instantly!
              </Text>
            </View>
          </View>
        </View>
      </Modal>

      {/* Notifications Modal */}
      <Modal
        visible={showNotificationsModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowNotificationsModal(false)}
      >
        <View style={screenStyles.modalBackdrop}>
          <View style={[screenStyles.modalCard, { maxHeight: '80%' }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <Text style={screenStyles.modalTitle}>Notification Settings</Text>
              <TouchableOpacity onPress={() => setShowNotificationsModal(false)}>
                <Ionicons name="close" size={24} color={theme.iconPrimary} />
              </TouchableOpacity>
            </View>

            <ScrollView>
              <Text style={{ fontSize: 14, color: theme.textSecondary, marginBottom: 20, lineHeight: 20 }}>
                Manage how and when you receive notifications about your workouts and routines.
              </Text>

              <TouchableOpacity
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  paddingVertical: theme.spacing.lg,
                  borderBottomWidth: 1,
                  borderBottomColor: theme.borderLight,
                }}
                onPress={() => setNotificationSettings({ ...notificationSettings, workoutReminders: !notificationSettings.workoutReminders })}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 16, fontWeight: '600', color: theme.text, marginBottom: 4 }}>
                    Workout Reminders
                  </Text>
                  <Text style={{ fontSize: 14, color: theme.textSecondary }}>
                    Get reminded to start your scheduled workouts
                  </Text>
                </View>
                <View style={{
                  width: 50,
                  height: 30,
                  borderRadius: 15,
                  backgroundColor: notificationSettings.workoutReminders ? '#06b6d4' : theme.borderDark,
                  justifyContent: 'center',
                  paddingHorizontal: theme.spacing.xs,
                }}>
                  <View style={{
                    width: 26,
                    height: 26,
                    borderRadius: 13,
                    backgroundColor: '#fff',
                    transform: [{ translateX: notificationSettings.workoutReminders ? 20 : 0 }],
                  }} />
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  paddingVertical: theme.spacing.lg,
                  borderBottomWidth: 1,
                  borderBottomColor: theme.borderLight,
                }}
                onPress={() => setNotificationSettings({ ...notificationSettings, completionAlerts: !notificationSettings.completionAlerts })}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 16, fontWeight: '600', color: theme.text, marginBottom: 4 }}>
                    Completion Alerts
                  </Text>
                  <Text style={{ fontSize: 14, color: theme.textSecondary }}>
                    Notify when you complete a routine
                  </Text>
                </View>
                <View style={{
                  width: 50,
                  height: 30,
                  borderRadius: 15,
                  backgroundColor: notificationSettings.completionAlerts ? '#06b6d4' : theme.borderDark,
                  justifyContent: 'center',
                  paddingHorizontal: theme.spacing.xs,
                }}>
                  <View style={{
                    width: 26,
                    height: 26,
                    borderRadius: 13,
                    backgroundColor: '#fff',
                    transform: [{ translateX: notificationSettings.completionAlerts ? 20 : 0 }],
                  }} />
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  paddingVertical: theme.spacing.lg,
                }}
                onPress={() => setNotificationSettings({ ...notificationSettings, weeklySummary: !notificationSettings.weeklySummary })}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 16, fontWeight: '600', color: theme.text, marginBottom: 4 }}>
                    Weekly Summary
                  </Text>
                  <Text style={{ fontSize: 14, color: theme.textSecondary }}>
                    Receive a weekly summary of your workout progress
                  </Text>
                </View>
                <View style={{
                  width: 50,
                  height: 30,
                  borderRadius: 15,
                  backgroundColor: notificationSettings.weeklySummary ? '#06b6d4' : theme.borderDark,
                  justifyContent: 'center',
                  paddingHorizontal: theme.spacing.xs,
                }}>
                  <View style={{
                    width: 26,
                    height: 26,
                    borderRadius: 13,
                    backgroundColor: '#fff',
                    transform: [{ translateX: notificationSettings.weeklySummary ? 20 : 0 }],
                  }} />
                </View>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Units Modal */}
      <Modal
        visible={showUnitsModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowUnitsModal(false)}
      >
        <View style={screenStyles.modalBackdrop}>
          <View style={[screenStyles.modalCard, { maxHeight: '80%' }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <Text style={screenStyles.modalTitle}>Units</Text>
              <TouchableOpacity onPress={() => setShowUnitsModal(false)}>
                <Ionicons name="close" size={24} color={theme.iconPrimary} />
              </TouchableOpacity>
            </View>

            <ScrollView>
              <Text style={{ fontSize: 14, color: theme.textSecondary, marginBottom: 24, lineHeight: 20 }}>
                Choose your preferred unit system for displaying measurements and distances.
              </Text>

              <TouchableOpacity
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  padding: 16,
                  borderRadius: 12,
                  backgroundColor: unitPreference === 'metric' ? '#e0d7ff' : theme.cardSecondary,
                  borderWidth: 2,
                  borderColor: unitPreference === 'metric' ? '#06b6d4' : theme.border,
                  marginBottom: 12,
                }}
                onPress={() => setUnitPreference('metric')}
              >
                <Ionicons 
                  name={unitPreference === 'metric' ? 'radio-button-on' : 'radio-button-off'} 
                  size={24} 
                  color={unitPreference === 'metric' ? '#06b6d4' : theme.textSecondary} 
                  style={{ marginRight: 12 }}
                />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 16, fontWeight: '600', color: theme.text, marginBottom: 4 }}>
                    Metric
                  </Text>
                  <Text style={{ fontSize: 14, color: theme.textSecondary }}>
                    Kilometers, meters, kilograms
                  </Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  padding: 16,
                  borderRadius: 12,
                  backgroundColor: unitPreference === 'imperial' ? '#e0d7ff' : theme.cardSecondary,
                  borderWidth: 2,
                  borderColor: unitPreference === 'imperial' ? '#06b6d4' : theme.border,
                }}
                onPress={() => setUnitPreference('imperial')}
              >
                <Ionicons 
                  name={unitPreference === 'imperial' ? 'radio-button-on' : 'radio-button-off'} 
                  size={24} 
                  color={unitPreference === 'imperial' ? '#06b6d4' : theme.textSecondary} 
                  style={{ marginRight: 12 }}
                />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 16, fontWeight: '600', color: theme.text, marginBottom: 4 }}>
                    Imperial
                  </Text>
                  <Text style={{ fontSize: 14, color: theme.textSecondary }}>
                    Miles, feet, pounds
                  </Text>
                </View>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* About Modal */}
      <Modal
        visible={showAboutModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowAboutModal(false)}
      >
        <View style={screenStyles.modalBackdrop}>
          <View style={[screenStyles.modalCard, { maxHeight: '80%' }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <Text style={screenStyles.modalTitle}>About</Text>
              <TouchableOpacity onPress={() => setShowAboutModal(false)}>
                <Ionicons name="close" size={24} color={theme.iconPrimary} />
              </TouchableOpacity>
            </View>

            <ScrollView>
              <View style={{ alignItems: 'center', marginBottom: 24 }}>
                <View style={{
                  width: 80,
                  height: 80,
                  borderRadius: 20,
                  backgroundColor: '#e0d7ff',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: 16,
                }}>
                  <Ionicons name="fitness" size={40} color="#06b6d4" />
                </View>
                <Text style={{ fontSize: 24, fontWeight: '700', color: theme.text, marginBottom: 8 }}>
                  SyncApp
                </Text>
                <Text style={{ fontSize: 16, color: theme.textSecondary, marginBottom: 4 }}>
                  Version 1.0.0
                </Text>
              </View>

              <Text style={{ fontSize: 14, color: theme.textSecondary, marginBottom: 20, lineHeight: 20 }}>
                SyncApp is a fitness and productivity app that helps you create and manage workout routines with integrated music playback. Build custom interval training routines, connect your favorite music platforms, and track your progress.
              </Text>

              <View style={{ marginTop: theme.spacing.xl, paddingTop: theme.spacing.xl, borderTopWidth: 1, borderTopColor: theme.border }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: theme.text, marginBottom: 12 }}>
                  Features
                </Text>
                <View style={{ marginBottom: 8 }}>
                  <Text style={{ fontSize: 14, color: theme.textSecondary, marginBottom: 4 }}>• Custom workout routines</Text>
                  <Text style={{ fontSize: 14, color: theme.textSecondary, marginBottom: 4 }}>• Interval timer with visual progress</Text>
                  <Text style={{ fontSize: 14, color: theme.textSecondary, marginBottom: 4 }}>• Music platform integration</Text>
                  <Text style={{ fontSize: 14, color: theme.textSecondary, marginBottom: 4 }}>• Workout sharing and discovery</Text>
                  <Text style={{ fontSize: 14, color: theme.textSecondary }}>• Progress tracking</Text>
                </View>
              </View>

              <View style={{ marginTop: theme.spacing.xl, paddingTop: theme.spacing.xl, borderTopWidth: 1, borderTopColor: theme.border }}>
                <Text style={{ fontSize: 12, color: theme.textTertiary, textAlign: 'center' }}>
                  © 2024 SyncApp. All rights reserved.
                </Text>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Settings Modal */}
      <Modal
        visible={showSettingsModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowSettingsModal(false)}
      >
        <View style={screenStyles.modalBackdrop}>
          <View style={[screenStyles.modalCard, { maxHeight: '80%' }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <Text style={screenStyles.modalTitle}>Settings</Text>
              <TouchableOpacity onPress={() => setShowSettingsModal(false)}>
                <Ionicons name="close" size={24} color={theme.iconPrimary} />
              </TouchableOpacity>
            </View>

            <ScrollView>
              <Text style={{ fontSize: 14, color: theme.textSecondary, marginBottom: 24, lineHeight: 20 }}>
                Configure app preferences and behavior settings.
              </Text>

              <View style={{ marginBottom: 20 }}>
                <Text style={{ fontSize: 16, fontWeight: '600', color: theme.text, marginBottom: 12 }}>
                  App Preferences
                </Text>
                
                <TouchableOpacity
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    paddingVertical: theme.spacing.lg,
                    borderBottomWidth: 1,
                    borderBottomColor: theme.borderLight,
                  }}
                  onPress={() => Alert.alert('Theme', 'Dark mode coming soon!')}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Ionicons name="moon-outline" size={20} color={theme.iconPrimary} style={{ marginRight: 12 }} />
                    <Text style={{ fontSize: 16, color: theme.text }}>Dark Mode</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={theme.iconTertiary} />
                </TouchableOpacity>

                <TouchableOpacity
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    paddingVertical: theme.spacing.lg,
                    borderBottomWidth: 1,
                    borderBottomColor: theme.borderLight,
                  }}
                  onPress={() => Alert.alert('Language', 'Language selection coming soon!')}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Ionicons name="language-outline" size={20} color={theme.iconPrimary} style={{ marginRight: 12 }} />
                    <Text style={{ fontSize: 16, color: theme.text }}>Language</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={theme.iconTertiary} />
                </TouchableOpacity>

                <TouchableOpacity
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    paddingVertical: theme.spacing.lg,
                  }}
                  onPress={() => Alert.alert('Data & Privacy', 'Privacy settings coming soon!')}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Ionicons name="shield-checkmark-outline" size={20} color={theme.iconPrimary} style={{ marginRight: 12 }} />
                    <Text style={{ fontSize: 16, color: theme.text }}>Data & Privacy</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={theme.iconTertiary} />
                </TouchableOpacity>
              </View>

              <View style={{ marginTop: theme.spacing.xl, paddingTop: theme.spacing.xl, borderTopWidth: 1, borderTopColor: theme.border }}>
                <Text style={{ fontSize: 16, fontWeight: '600', color: theme.text, marginBottom: 12 }}>
                  Storage
                </Text>
                
                <TouchableOpacity
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    paddingVertical: theme.spacing.lg,
                  }}
                  onPress={() => Alert.alert('Clear Cache', 'Cache cleared successfully!')}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Ionicons name="trash-outline" size={20} color={theme.iconPrimary} style={{ marginRight: 12 }} />
                    <Text style={{ fontSize: 16, color: theme.text }}>Clear Cache</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={theme.iconTertiary} />
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Help & Support Modal */}
      <Modal
        visible={showHelpModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowHelpModal(false)}
      >
        <View style={screenStyles.modalBackdrop}>
          <View style={[screenStyles.modalCard, { maxHeight: '80%' }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <Text style={screenStyles.modalTitle}>Help & Support</Text>
              <TouchableOpacity onPress={() => setShowHelpModal(false)}>
                <Ionicons name="close" size={24} color={theme.iconPrimary} />
              </TouchableOpacity>
            </View>

            <ScrollView>
              <Text style={{ fontSize: 14, color: theme.textSecondary, marginBottom: 24, lineHeight: 20 }}>
                Get help with using SyncApp or contact our support team.
              </Text>

              <TouchableOpacity
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  padding: 16,
                  borderRadius: 12,
                  backgroundColor: theme.cardSecondary,
                  borderWidth: 1,
                  borderColor: theme.border,
                  marginBottom: 12,
                }}
                onPress={() => Alert.alert('Getting Started', 'To get started:\n\n1. Create a routine from the Home screen\n2. Set your work and rest intervals\n3. Connect a music platform\n4. Start your workout!')}
              >
                <Ionicons name="book-outline" size={24} color="#06b6d4" style={{ marginRight: 12 }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 16, fontWeight: '600', color: theme.text, marginBottom: 4 }}>
                    Getting Started Guide
                  </Text>
                  <Text style={{ fontSize: 14, color: theme.textSecondary }}>
                    Learn how to use SyncApp
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={theme.iconTertiary} />
              </TouchableOpacity>

              <TouchableOpacity
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  padding: 16,
                  borderRadius: 12,
                  backgroundColor: theme.cardSecondary,
                  borderWidth: 1,
                  borderColor: theme.border,
                  marginBottom: 12,
                }}
                onPress={() => Alert.alert('FAQ', 'Frequently Asked Questions:\n\nQ: How do I connect Spotify?\nA: Go to Profile > Music Platforms > Spotify\n\nQ: Can I use multiple music platforms?\nA: Yes, you can connect multiple platforms\n\nQ: How do I share a routine?\nA: Create a post from the Profile screen')}
              >
                <Ionicons name="help-circle-outline" size={24} color="#3b82f6" style={{ marginRight: 12 }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 16, fontWeight: '600', color: theme.text, marginBottom: 4 }}>
                    Frequently Asked Questions
                  </Text>
                  <Text style={{ fontSize: 14, color: theme.textSecondary }}>
                    Common questions and answers
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={theme.iconTertiary} />
              </TouchableOpacity>

              <TouchableOpacity
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  padding: 16,
                  borderRadius: 12,
                  backgroundColor: theme.cardSecondary,
                  borderWidth: 1,
                  borderColor: theme.border,
                  marginBottom: 12,
                }}
                onPress={() => Alert.alert('Contact Support', 'Email: support@syncapp.com\n\nWe typically respond within 24 hours.')}
              >
                <Ionicons name="mail-outline" size={24} color="#10b981" style={{ marginRight: 12 }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 16, fontWeight: '600', color: theme.text, marginBottom: 4 }}>
                    Contact Support
                  </Text>
                  <Text style={{ fontSize: 14, color: theme.textSecondary }}>
                    Get in touch with our team
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={theme.iconTertiary} />
              </TouchableOpacity>

              <TouchableOpacity
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  padding: 16,
                  borderRadius: 12,
                  backgroundColor: theme.cardSecondary,
                  borderWidth: 1,
                  borderColor: theme.border,
                }}
                onPress={() => Alert.alert('Report a Bug', 'Found a bug? Please email us at bugs@syncapp.com with details about the issue.')}
              >
                <Ionicons name="bug-outline" size={24} color="#ef4444" style={{ marginRight: 12 }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 16, fontWeight: '600', color: theme.text, marginBottom: 4 }}>
                    Report a Bug
                  </Text>
                  <Text style={{ fontSize: 14, color: theme.textSecondary }}>
                    Help us improve the app
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={theme.iconTertiary} />
              </TouchableOpacity>

              <View style={{ marginTop: theme.spacing['2xl'], paddingTop: theme.spacing.xl, borderTopWidth: 1, borderTopColor: theme.border }}>
                <Text style={{ fontSize: 12, color: theme.textTertiary, textAlign: 'center', lineHeight: 18 }}>
                  Need immediate help? Check out our documentation or reach out to support.
                </Text>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Edit Profile Modal */}
      <Modal
        visible={showEditProfileModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowEditProfileModal(false)}
      >
        <View style={{ flex: 1, backgroundColor: theme.modalOverlay, justifyContent: 'flex-end' }}>
          <View style={{
            backgroundColor: theme.modalBackground,
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            padding: theme.spacing.xl,
            maxHeight: '80%',
          }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <Text style={{ fontSize: 20, fontWeight: '700', color: theme.text }}>Edit Profile</Text>
              <TouchableOpacity onPress={() => setShowEditProfileModal(false)}>
                <Ionicons name="close" size={24} color={theme.iconPrimary} />
              </TouchableOpacity>
            </View>

            <ScrollView>
              {/* Bio Input */}
              <View style={{ marginBottom: 24 }}>
                <Text style={{ fontSize: 16, fontWeight: '600', color: theme.text, marginBottom: 8 }}>Bio</Text>
                <TextInput
                  style={{
                    borderWidth: 1,
                    borderColor: theme.border,
                    borderRadius: 8,
                    padding: 12,
                    fontSize: 16,
                    color: theme.text,
                    minHeight: 100,
                    textAlignVertical: 'top',
                    backgroundColor: theme.cardSecondary,
                  }}
                  placeholder="Tell us about yourself..."
                  placeholderTextColor="#9ca3af"
                  value={bio}
                  onChangeText={setBio}
                  multiline
                  numberOfLines={4}
                />
              </View>

              {/* Social Media Links */}
              <View style={{ marginBottom: 24 }}>
                <Text style={{ fontSize: 16, fontWeight: '600', color: theme.text, marginBottom: 16 }}>Social Media Links</Text>
                
                {/* Instagram */}
                <View style={{ marginBottom: 16 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                    <Ionicons name="logo-instagram" size={20} color="#E4405F" style={{ marginRight: 8 }} />
                    <Text style={{ fontSize: 14, fontWeight: '600', color: theme.text }}>Instagram</Text>
                  </View>
                  <TextInput
                    style={{
                      borderWidth: 1,
                      borderColor: theme.border,
                      borderRadius: 8,
                      padding: theme.spacing.md,
                      fontSize: 16,
                      color: theme.text,
                      backgroundColor: theme.cardSecondary,
                    }}
                    placeholder="instagram.com/username"
                    placeholderTextColor="#9ca3af"
                    value={socialLinks.instagram}
                    onChangeText={(value) => handleSocialLinkChange('instagram', value)}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>

                {/* Twitter */}
                <View style={{ marginBottom: 16 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                    <Ionicons name="logo-twitter" size={20} color="#1DA1F2" style={{ marginRight: 8 }} />
                    <Text style={{ fontSize: 14, fontWeight: '600', color: theme.text }}>Twitter/X</Text>
                  </View>
                  <TextInput
                    style={{
                      borderWidth: 1,
                      borderColor: theme.border,
                      borderRadius: 8,
                      padding: theme.spacing.md,
                      fontSize: 16,
                      color: theme.text,
                      backgroundColor: theme.cardSecondary,
                    }}
                    placeholder="twitter.com/username or x.com/username"
                    placeholderTextColor="#9ca3af"
                    value={socialLinks.twitter}
                    onChangeText={(value) => handleSocialLinkChange('twitter', value)}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>

                {/* TikTok */}
                <View style={{ marginBottom: 16 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                    <Ionicons name="logo-tiktok" size={20} color="#000000" style={{ marginRight: 8 }} />
                    <Text style={{ fontSize: 14, fontWeight: '600', color: theme.text }}>TikTok</Text>
                  </View>
                  <TextInput
                    style={{
                      borderWidth: 1,
                      borderColor: theme.border,
                      borderRadius: 8,
                      padding: theme.spacing.md,
                      fontSize: 16,
                      color: theme.text,
                      backgroundColor: theme.cardSecondary,
                    }}
                    placeholder="tiktok.com/@username"
                    placeholderTextColor="#9ca3af"
                    value={socialLinks.tiktok}
                    onChangeText={(value) => handleSocialLinkChange('tiktok', value)}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>

                {/* YouTube */}
                <View style={{ marginBottom: 24 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                    <Ionicons name="logo-youtube" size={20} color="#FF0000" style={{ marginRight: 8 }} />
                    <Text style={{ fontSize: 14, fontWeight: '600', color: theme.text }}>YouTube</Text>
                  </View>
                  <TextInput
                    style={{
                      borderWidth: 1,
                      borderColor: theme.border,
                      borderRadius: 8,
                      padding: theme.spacing.md,
                      fontSize: 16,
                      color: theme.text,
                      backgroundColor: theme.cardSecondary,
                    }}
                    placeholder="youtube.com/@username"
                    placeholderTextColor="#9ca3af"
                    value={socialLinks.youtube}
                    onChangeText={(value) => handleSocialLinkChange('youtube', value)}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>
              </View>

              {/* Save Button */}
              <TouchableOpacity
                style={[screenStyles.button, screenStyles.primaryButton, { marginBottom: 12 }]}
                onPress={handleSaveProfile}
              >
                <Text style={screenStyles.buttonTextPrimary}>Save Changes</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </ScreenWrapper>
  );
}

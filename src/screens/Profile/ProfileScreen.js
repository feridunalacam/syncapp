import Surface from '../../components/common/Surface';
import SpotifyDevicePicker from '../../components/common/SpotifyDevicePicker';
import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  TextInput,
  Alert,
  Image,
  Switch,
  StyleSheet,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useIsFocused } from '@react-navigation/native';
import * as Linking from 'expo-linking';
import * as Clipboard from 'expo-clipboard';
import { useRoutineContext } from '../../context/RoutineContext';
import { usePostContext } from '../../context/PostContext';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { useAccountData } from '../../context/AccountDataContext';
import { useSubscription } from '../../context/SubscriptionContext';
import { useAds } from '../../context/AdsContext';
import { useWorkout } from '../../context/WorkoutContext';
import AccountPanel from '../../components/account/AccountPanel';
import SubscriptionPanel from '../../components/account/SubscriptionPanel';
import ScreenWrapper from '../../components/common/ScreenWrapper';
import ScreenHeader from '../../components/common/ScreenHeader';
import GlassSurface from '../../components/common/GlassSurface';
import Sheet from '../../components/common/Sheet';
import useProfileData from './hooks/useProfileData';
import SpotifyLogo from './components/SpotifyLogo';
import useSpotifyConnection from './hooks/useSpotifyConnection';

export default function ProfileScreen() {
  const { theme, isDark, toggleTheme } = useTheme();
  const auth = useAuth();
  const cloud = useAccountData();
  const subscription = useSubscription();
  const ads = useAds();
  const workout = useWorkout();
  const focused = useIsFocused();
  const { routines, completedRoutines } = useRoutineContext();
  const { posts, addPost, deletePost } = usePostContext();
  const profile = useProfileData();
  const spotify = useSpotifyConnection();
  const [sheet, setSheet] = useState(null);
  const [caption, setCaption] = useState('');
  const [routineId, setRoutineId] = useState(null);
  const [category, setCategory] = useState('sport');
  const [cloudBusy, setCloudBusy] = useState(false);
  const [privacyBusy, setPrivacyBusy] = useState(false);
  const adPrivacyBusy = privacyBusy || ads.privacyOptionsBusy;
  const privacySafeRef = useRef(false);
  privacySafeRef.current =
    focused &&
    ads.appActive === true &&
    sheet === null &&
    !cloudBusy &&
    !auth.recoveryMode &&
    !auth.error &&
    !spotify.connecting &&
    workout?.isWorkoutRunning === false &&
    workout?.isMusicPlaying === false &&
    workout?.isAudioSyncing === false;
  useEffect(
    () => () => {
      privacySafeRef.current = false;
    },
    [],
  );
  const openAdPrivacy = async () => {
    if (adPrivacyBusy) return;
    if (workout.isWorkoutRunning || workout.isMusicPlaying || workout.isAudioSyncing) {
      Alert.alert(
        'Ad privacy choices',
        'Finish your session or stop playback before changing ad privacy choices.',
      );
      return;
    }
    if (!privacySafeRef.current) return;
    setPrivacyBusy(true);
    try {
      const result = await ads.requestPrivacyOptions(() => privacySafeRef.current);
      if (!result?.changed && privacySafeRef.current) {
        Alert.alert(
          'Ad privacy choices',
          !result?.error && result?.status === 'NOT_REQUIRED'
            ? 'No additional advertising privacy choices are required for this device right now. You can read more in Privacy policy.'
            : 'Privacy choices are not available right now. Please try again later.',
        );
      }
    } catch {
      if (privacySafeRef.current)
        Alert.alert(
          'Ad privacy choices',
          'Privacy choices could not be opened. Please try again later.',
        );
    } finally {
      setPrivacyBusy(false);
    }
  };
  const accountAction = async (action, success) => {
    if (cloudBusy) return;
    setCloudBusy(true);
    try {
      await action();
      if (success) Alert.alert(success);
    } catch (error) {
      Alert.alert('Could not complete this action', error?.message || 'Please try again.');
    } finally {
      setCloudBusy(false);
    }
  };
  const importDeviceData = () =>
    Alert.alert(
      'Import existing device data?',
      'Copy guest routines, activity and profile into this account. Existing account records are kept. This device’s guest data can only be claimed by one account.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Import',
          onPress: () => accountAction(cloud.importGuestData, 'Device data imported'),
        },
      ],
    );
  const syncDetail = !auth.user
    ? 'Sign in to keep your data with your account.'
    : !subscription.isPro
      ? 'Sync Pro backs up your routines and activity across devices.'
      : cloud.status === 'syncing'
        ? 'Syncing your private backup…'
        : cloud.status === 'paused'
          ? 'Cloud sync will continue after your workout.'
          : cloud.status === 'conflict'
            ? 'Your backup changed on another device. Choose which version to keep.'
            : cloud.status === 'error' || cloud.status === 'offline'
              ? (typeof cloud.error === 'string' ? cloud.error : cloud.error?.message) ||
                'Could not sync. Your data is saved on this device.'
              : cloud.lastSyncedAt && Number.isFinite(new Date(cloud.lastSyncedAt).getTime())
                ? `Last synced ${new Date(cloud.lastSyncedAt).toLocaleString()}`
                : 'Your private cloud backup is ready.';
  const resolveConflict = (choice) =>
    Alert.alert(
      choice === 'cloud' ? 'Use your cloud backup?' : 'Use this device’s data?',
      choice === 'cloud'
        ? 'Replace the account data on this device with your latest cloud backup. A local recovery copy of this device’s data will be kept.'
        : 'Replace your cloud backup with the account data on this device. Other devices will receive this version when they next sync.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: choice === 'cloud' ? 'Use cloud backup' : 'Use this device',
          onPress: () =>
            accountAction(async () => {
              await cloud.resolveConflict(choice);
              setSheet(null);
            }, 'Backup updated'),
        },
      ],
    );
  const ownPosts = posts.filter((p) => p.authorId === 'current-user');
  const section = (title) => (
    <Text style={[styles.section, { color: theme.textSecondary }]}>{title}</Text>
  );
  const row = (icon, label, detail, onPress, right, divided = false) => (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={[
        styles.row,
        divided && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border },
      ]}
      accessibilityRole={onPress ? 'button' : undefined}
    >
      <View style={[styles.rowIcon, { backgroundColor: theme.cardSecondary }]}>
        {icon === 'logo-spotify' ? (
          <SpotifyLogo iconSize={20} showText={false} />
        ) : (
          <Ionicons name={icon} size={19} color={theme.textSecondary} />
        )}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: theme.text, fontSize: 15, fontWeight: '500' }}>{label}</Text>
        {detail && (
          <Text style={{ color: theme.textSecondary, fontSize: 11, lineHeight: 17, marginTop: 4 }}>
            {detail}
          </Text>
        )}
      </View>
      {right ||
        (onPress && <Ionicons name="chevron-forward" size={16} color={theme.textTertiary} />)}
    </Pressable>
  );
  const button = (label, onPress) => (
    <Pressable
      onPress={onPress}
      style={[styles.button, { backgroundColor: theme.accent }]}
      accessibilityRole="button"
    >
      <Text style={{ color: theme.accentText, fontSize: 15, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
  const publish = () => {
    const routine = routines.find((r) => r.id === routineId);
    if (!routine) {
      Alert.alert('Choose a routine', 'Select a saved routine first.');
      return;
    }
    addPost({
      id: `post-${Date.now()}`,
      authorId: 'current-user',
      authorName: 'You',
      routine: JSON.parse(JSON.stringify(routine)),
      type: 'new',
      category,
      caption: caption.trim(),
      createdAt: new Date().toISOString(),
      upvotes: 0,
      downvotes: 0,
      userVote: 0,
    });
    setSheet(null);
    setCaption('');
    setRoutineId(null);
  };
  const openLink = async (url) => {
    try {
      await Linking.openURL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
    } catch {
      Alert.alert('Could not open link', 'Check the address in Edit profile.');
    }
  };
  return (
    <ScreenWrapper>
      <ScreenHeader
        title="Profile"
        subtitle=""
        icon="create-outline"
        actionLabel="Edit profile"
        onAction={profile.ready ? () => setSheet('profile') : undefined}
      />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        pointerEvents={adPrivacyBusy ? 'none' : 'auto'}
        accessibilityState={{ busy: !!adPrivacyBusy }}
      >
        <Surface variant="card" style={styles.profile}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
            <Pressable onPress={profile.changePicture} accessibilityLabel="Change profile photo">
              <View style={[styles.avatar, { backgroundColor: theme.cardSecondary }]}>
                {profile.picture ? (
                  <Image source={{ uri: profile.picture }} style={styles.photo} />
                ) : (
                  <Ionicons name="person-outline" size={29} color={theme.textSecondary} />
                )}
              </View>
            </Pressable>
            <Pressable
              onPress={() => setSheet('profile')}
              style={{ flex: 1 }}
              accessibilityLabel="Edit profile details"
            >
              <Text style={{ color: theme.text, fontSize: 20, fontWeight: '600' }}>
                Your profile
              </Text>
              <Text
                numberOfLines={2}
                style={{ color: theme.textSecondary, fontSize: 12, lineHeight: 18, marginTop: 5 }}
              >
                {profile.bio || 'Add a bio'}
              </Text>
            </Pressable>
          </View>
          <View
            style={[
              styles.links,
              !Object.values(profile.links).some(Boolean) && { display: 'none' },
            ]}
          >
            {Object.entries(profile.links)
              .filter(([, url]) => url)
              .map(([name, url]) => (
                <Pressable
                  key={name}
                  onPress={() => openLink(url)}
                  hitSlop={10}
                  accessibilityLabel={`Open ${name}`}
                >
                  <Ionicons
                    name={name === 'twitter' ? 'logo-twitter' : `logo-${name}`}
                    size={19}
                    color={theme.textSecondary}
                  />
                </Pressable>
              ))}
          </View>
          <View style={[styles.stats, { borderColor: theme.border }]}>
            {[
              [routines.length, 'Routines'],
              [completedRoutines.length, 'Sessions'],
              [ownPosts.length, 'Posts'],
            ].map(([value, label], index) => (
              <View
                key={label}
                style={[
                  styles.stat,
                  index > 0 && {
                    borderLeftWidth: StyleSheet.hairlineWidth,
                    borderLeftColor: theme.border,
                  },
                ]}
              >
                <Text style={{ color: theme.text, fontSize: 22, fontWeight: '600' }}>{value}</Text>
                <Text style={{ color: theme.textSecondary, fontSize: 10, marginTop: 5 }}>
                  {label}
                </Text>
              </View>
            ))}
          </View>
        </Surface>
        {section('Account')}
        <Surface variant="card" style={[styles.group, { backgroundColor: theme.card }]}>
          {row(
            'person-circle-outline',
            auth.user ? 'Your account' : 'Sign in or create account',
            auth.user?.email || 'Keep guest mode, or sign in to use account features.',
            () => setSheet('account'),
          )}
          {row(
            'sparkles-outline',
            subscription.isPro ? 'Sync Pro' : 'Explore Sync Pro',
            subscription.isPro
              ? 'Your Pro membership is active. All ads are removed.'
              : subscription.pending
                ? 'Confirming your purchase with the store…'
                : 'Cloud backup, device sync and no ads.',
            () => setSheet('subscription'),
            <Text style={{ color: theme.accent, fontSize: 12, fontWeight: '600' }}>
              {subscription.isPro ? 'Pro' : subscription.pending ? 'Verifying' : 'Free'}
            </Text>,
            true,
          )}
          {row(
            cloud.status === 'error' || cloud.status === 'offline'
              ? 'cloud-offline-outline'
              : 'cloud-outline',
            'Cloud backup',
            syncDetail,
            cloud.status === 'syncing' || cloudBusy
              ? undefined
              : !auth.user
                ? () => setSheet('account')
                : !subscription.isPro
                  ? () => setSheet('subscription')
                  : cloud.status === 'conflict'
                    ? () => setSheet('cloud-conflict')
                    : () => accountAction(cloud.syncNow),
            <Text style={{ color: theme.accent, fontSize: 12, fontWeight: '600' }}>
              {cloud.status === 'syncing' || cloudBusy
                ? '…'
                : cloud.status === 'conflict'
                  ? 'Review'
                  : subscription.isPro
                    ? 'Sync now'
                    : 'Pro'}
            </Text>,
            true,
          )}
          {!!auth.user &&
            !!cloud.hasGuestData &&
            !cloud.importComplete &&
            row(
              'download-outline',
              'Import device data',
              'Bring your existing guest routines and activity into this account.',
              cloud.status === 'syncing' || cloudBusy ? undefined : importDeviceData,
              null,
              true,
            )}
          <Text style={[styles.cloudNote, { color: theme.textSecondary }]}>
            Audio files and profile photos stay on this device. Re-select local files when using
            another device.
          </Text>
        </Surface>
        {section('Music')}
        <Surface variant="card" style={[styles.group, { backgroundColor: theme.card }]}>
          {row(
            'logo-spotify',
            'Spotify',
            spotify.connected
              ? 'Connected · controls playback on your Spotify device'
              : spotify.connecting
                ? 'Connecting…'
                : 'Connect your music account',
            spotify.connected
              ? spotify.disconnect
              : spotify.ready && !spotify.connecting
                ? spotify.connect
                : undefined,
            <Text style={{ color: theme.accent, fontSize: 12, fontWeight: '600' }}>
              {spotify.connected ? 'Disconnect' : spotify.connecting ? '…' : 'Connect'}
            </Text>,
          )}
          <SpotifyDevicePicker />
          {row(
            'musical-notes-outline',
            'Device audio',
            'Add audio files inside any routine.',
            null,
            null,
            true,
          )}
        </Surface>
        {section('Preferences')}
        <Surface variant="card" style={[styles.group, { backgroundColor: theme.card }]}>
          {row(
            'moon-outline',
            'Dark appearance',
            null,
            null,
            <Switch
              value={isDark}
              onValueChange={toggleTheme}
              trackColor={{ true: theme.accent }}
              accessibilityLabel="Dark appearance"
            />,
          )}
          {row(
            'shield-checkmark-outline',
            'Privacy policy',
            'How Sync uses account, subscription and advertising information.',
            process.env.EXPO_PUBLIC_PRIVACY_URL
              ? () => openLink(process.env.EXPO_PUBLIC_PRIVACY_URL)
              : undefined,
            null,
            true,
          )}
          {(ads.nativeAvailable || ads.privacyOptionsRequired) &&
            row(
              'options-outline',
              'Ad privacy choices',
              adPrivacyBusy
                ? 'Opening your choices…'
                : 'Review and update your advertising choices.',
              adPrivacyBusy ? undefined : openAdPrivacy,
              null,
              true,
            )}
          {row(
            'flash-outline',
            'Routine shortcuts',
            'Open a routine from a shortcut.',
            () => setSheet('shortcuts'),
            null,
            true,
          )}
          {row('help-circle-outline', 'How Sync works', null, () => setSheet('help'), null, true)}
          {row(
            'information-circle-outline',
            'About this version',
            'Routines, music and your Sync account.',
            () => setSheet('about'),
            null,
            true,
          )}
        </Surface>
        <View style={styles.sectionRow}>
          {section('Your posts')}
          <Pressable
            onPress={() => setSheet('post')}
            accessibilityLabel="Create local routine post"
          >
            <GlassSurface interactive style={styles.plus}>
              <Ionicons name="add" size={21} color={theme.accent} />
            </GlassSurface>
          </Pressable>
        </View>
        {ownPosts.length ? (
          ownPosts.map((post) => (
            <Surface
              variant="card"
              key={post.id}
              style={[styles.post, { backgroundColor: theme.card }]}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.text, fontWeight: '600', fontSize: 15 }}>
                  {post.routine.name}
                </Text>
                <Text
                  style={{ color: theme.textSecondary, fontSize: 12, lineHeight: 18, marginTop: 6 }}
                >
                  {post.caption || 'Saved on this device'}
                </Text>
              </View>
              <Pressable
                onPress={() =>
                  Alert.alert('Delete post?', 'This removes the post from this device.', [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Delete', style: 'destructive', onPress: () => deletePost(post.id) },
                  ])
                }
                accessibilityLabel="Delete local post"
                style={{ padding: 9 }}
              >
                <Ionicons name="trash-outline" size={18} color={theme.textSecondary} />
              </Pressable>
            </Surface>
          ))
        ) : (
          <Text style={{ color: theme.textSecondary, fontSize: 12, lineHeight: 19 }}>
            Save a routine or session to Discover. Posts stay on this device.
          </Text>
        )}
      </ScrollView>
      <AccountPanel
        visible={sheet === 'account'}
        onClose={() => setSheet(null)}
        onManageSubscription={() => setSheet('subscription')}
      />
      <SubscriptionPanel
        visible={sheet === 'subscription'}
        onClose={() => setSheet(null)}
        onSignIn={() => setSheet('account')}
      />
      <Sheet
        visible={sheet === 'cloud-conflict'}
        title="Choose your backup"
        onClose={cloudBusy ? () => {} : () => setSheet(null)}
      >
        <Text style={[styles.prose, { color: theme.textSecondary }]}>
          Your account data changed on another device. Review which version to keep before syncing
          again.
        </Text>
        <Text style={[styles.prose, { color: theme.textSecondary }]}>
          Use the cloud version to update this device, or keep this device’s version and replace the
          cloud backup.
        </Text>
        {!cloudBusy && (
          <>
            {button('Use cloud backup', () => resolveConflict('cloud'))}
            {button('Use this device', () => resolveConflict('local'))}
          </>
        )}
        {cloudBusy && (
          <Text style={[styles.prose, { color: theme.textSecondary }]}>Updating your backup…</Text>
        )}
      </Sheet>
      <Sheet visible={sheet === 'profile'} title="Edit profile" onClose={() => setSheet(null)}>
        <ScrollView keyboardShouldPersistTaps="handled">
          <Text style={[styles.label, { color: theme.textSecondary }]}>BIO</Text>
          <TextInput
            value={profile.bio}
            onChangeText={profile.setBio}
            maxLength={300}
            multiline
            placeholder="A little about your rhythm…"
            placeholderTextColor={theme.textTertiary}
            style={[
              styles.input,
              { color: theme.text, backgroundColor: theme.inputBackground, minHeight: 90 },
            ]}
          />
          {Object.entries(profile.links).map(([name, url]) => (
            <View key={name}>
              <Text style={[styles.label, { color: theme.textSecondary }]}>
                {name.toUpperCase()}
              </Text>
              <TextInput
                value={url}
                onChangeText={(value) => profile.setLinks((prev) => ({ ...prev, [name]: value }))}
                autoCapitalize="none"
                keyboardType="url"
                placeholder="Profile URL"
                placeholderTextColor={theme.textTertiary}
                style={[
                  styles.input,
                  { color: theme.text, backgroundColor: theme.inputBackground },
                ]}
              />
            </View>
          ))}
          {button('Save profile', async () => {
            if (await profile.save()) setSheet(null);
          })}
        </ScrollView>
      </Sheet>
      <Sheet visible={sheet === 'post'} title="Save a routine post" onClose={() => setSheet(null)}>
        <ScrollView keyboardShouldPersistTaps="handled">
          <Text style={{ color: theme.textSecondary, lineHeight: 20, marginBottom: 16 }}>
            Your post will appear in Discover on this device.
          </Text>
          {routines.map((r) => (
            <Pressable
              key={r.id}
              onPress={() => setRoutineId(r.id)}
              style={[
                styles.choice,
                { backgroundColor: r.id === routineId ? theme.accentLight : theme.card },
              ]}
            >
              <Text
                style={{ color: r.id === routineId ? theme.accent : theme.text, fontWeight: '500' }}
              >
                {r.name}
              </Text>
              {r.id === routineId && <Ionicons name="checkmark" size={18} color={theme.accent} />}
            </Pressable>
          ))}
          <TextInput
            value={caption}
            onChangeText={setCaption}
            multiline
            maxLength={500}
            placeholder="Add a note…"
            placeholderTextColor={theme.textTertiary}
            style={[
              styles.input,
              {
                color: theme.text,
                backgroundColor: theme.inputBackground,
                minHeight: 85,
                marginTop: 14,
              },
            ]}
          />
          <View
            style={[
              styles.links,
              !Object.values(profile.links).some(Boolean) && { display: 'none' },
            ]}
          >
            {['sport', 'learn', 'study'].map((c) => (
              <Pressable key={c} onPress={() => setCategory(c)} style={{ paddingVertical: 14 }}>
                <Text
                  style={{
                    color: category === c ? theme.accent : theme.textSecondary,
                    fontWeight: category === c ? '700' : '400',
                  }}
                >
                  {c}
                </Text>
              </Pressable>
            ))}
          </View>
          {button('Save post', publish)}
        </ScrollView>
      </Sheet>
      <Sheet
        visible={sheet === 'shortcuts'}
        title="Routine shortcuts"
        onClose={() => setSheet(null)}
      >
        <ScrollView>
          <Text style={{ color: theme.textSecondary, lineHeight: 21, marginBottom: 18 }}>
            Tap a routine to copy its link. Add it to the Open URLs action in Apple Shortcuts. The
            link opens the routine; press Start when you are ready.
          </Text>
          {routines.map((r) => (
            <View key={r.id}>
              {row('link-outline', r.name, null, async () => {
                await Clipboard.setStringAsync(
                  Linking.createURL(`routine/${encodeURIComponent(r.id)}`),
                );
                Alert.alert(
                  'Link copied',
                  'Paste it into the Open URLs action. Expo Go links require the development server; an installed app uses its own link.',
                );
              })}
            </View>
          ))}
        </ScrollView>
      </Sheet>
      <Sheet visible={sheet === 'help'} title="How Sync works" onClose={() => setSheet(null)}>
        <Text style={[styles.prose, { color: theme.text }]}>
          1. Create a routine with work and rest intervals. Customize each round and attach music or
          a local alert sound.{'\n\n'}2. Choose it in Timer and press Start. You can pause, resume
          or skip intervals. Switching tabs keeps the session running.{'\n\n'}3. Open Activity
          inside Training to review actual session time, then create an image to share.{'\n\n'}
          Spotify needs an eligible account and an active playback device. Local files play directly
          in Sync.
        </Text>
      </Sheet>
      <Sheet visible={sheet === 'about'} title="About Sync" onClose={() => setSheet(null)}>
        <Text style={[styles.prose, { color: theme.text }]}>
          Sync brings intervals and music together for movement, study and focus.{'\n\n'}Use Sync on
          this device for free, or sign in to keep separate account data. Sync Pro adds private
          cloud backups for routines, activity and profile details across devices, plus no ads.
          Local audio files and Spotify credentials stay on this device.{'\n\n'}Discover posts are
          private saved content, not public online publishing. Manage your membership and account in
          the Account section above.
        </Text>
      </Sheet>
    </ScreenWrapper>
  );
}
const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingBottom: 24 },
  profile: {
    paddingHorizontal: 4,
    paddingTop: 4,
    paddingBottom: 5,
    borderRadius: 0,
    borderWidth: 0,
    backgroundColor: 'transparent',
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  photo: { width: 60, height: 60, borderRadius: 21 },
  links: { flexDirection: 'row', justifyContent: 'center', gap: 23, marginTop: 15 },
  stats: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 18,
    marginTop: 20,
    width: '100%',
  },
  stat: { alignItems: 'center', flex: 1, paddingVertical: 2 },
  section: { fontSize: 15, fontWeight: '600', marginTop: 23, marginBottom: 11 },
  group: { borderRadius: 20, paddingHorizontal: 15 },
  cloudNote: { fontSize: 11, lineHeight: 17, paddingTop: 4, paddingBottom: 15 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13 },
  rowIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  plus: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },
  post: {
    padding: 18,
    borderRadius: 23,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  label: { fontSize: 10, letterSpacing: 1, marginTop: 15, marginBottom: 9 },
  input: { padding: 15, borderRadius: 17, fontSize: 14 },
  button: { padding: 18, borderRadius: 23, alignItems: 'center', marginTop: 20 },
  choice: {
    padding: 16,
    borderRadius: 17,
    marginBottom: 9,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  prose: { fontSize: 14, lineHeight: 23, paddingBottom: 8 },
});

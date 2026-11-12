import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Linking from 'expo-linking';
import Sheet from '../common/Sheet';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { recoverySessionIdentity } from '../../lib/authRecoveryState';
import AppleSignInButton from './AppleSignInButton';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function AccountPanel({ visible, onClose, onManageSubscription }) {
  const { theme } = useTheme();
  const auth = useAuth();
  const [mode, setMode] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [deleteText, setDeleteText] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const running = useRef(false);
  const current = useRef({ visible, auth, version: 0 });
  current.current = {
    visible,
    auth,
    version: current.current.version + (current.current.visible === visible ? 0 : 1),
  };

  useEffect(() => {
    current.current.visible = visible;
    return () => {
      current.current.visible = false;
    };
  }, []);

  useEffect(() => {
    if (!visible) {
      setPassword('');
      setConfirmation('');
      setDeleteText('');
      return;
    }
    setMode(auth.recoveryMode ? 'recovery' : auth.user ? 'account' : 'signin');
    setEmail(auth.user?.email || '');
    setPassword('');
    setConfirmation('');
    setDeleteText('');
    setMessage('');
    setError('');
  }, [visible, auth.user?.id, auth.recoveryMode]);

  const available = auth.ready && auth.configured && !busy && !auth.socialProvider;
  const inputStyle = [styles.input, { color: theme.text, backgroundColor: theme.inputBackground }];
  const changeMode = (next) => {
    setMode(next);
    setPassword('');
    setConfirmation('');
    setDeleteText('');
    setMessage('');
    setError('');
  };
  const run = async (action) => {
    if (!available || running.current) return;
    running.current = true;
    setBusy(true);
    setError('');
    setMessage('');
    const target = recoverySessionIdentity(auth.session);
    const targetUserId = auth.user?.id;
    const presentation = current.current.version;
    const canFinish = () => {
      const latest = current.current;
      if (!latest?.visible || latest.version !== presentation) return false;
      if (!latest.auth.recoveryMode) return true;
      if (mode !== 'recovery') return false;
      const next = recoverySessionIdentity(latest.auth.session);
      return target
        ? target.userId === next?.userId && target.sessionId === next?.sessionId
        : targetUserId === latest.auth.user?.id;
    };
    try {
      await action(canFinish);
    } catch (failure) {
      if (canFinish()) setError(failure?.message || 'Something went wrong. Please try again.');
    } finally {
      running.current = false;
      setBusy(false);
    }
  };
  const submit = () => {
    if (mode !== 'recovery' && !emailPattern.test(email.trim())) {
      setError('Enter a valid email address.');
      return;
    }
    if (mode !== 'reset' && !password) {
      setError('Enter your password.');
      return;
    }
    if ((mode === 'signup' || mode === 'recovery') && password.length < 8) {
      setError('Choose a password with at least 8 characters.');
      return;
    }
    if ((mode === 'signup' || mode === 'recovery') && password !== confirmation) {
      setError('Your passwords do not match.');
      return;
    }
    run(async (canFinish) => {
      const address = email.trim();
      if (mode === 'signin') {
        await auth.signIn(address, password);
        if (canFinish()) onClose();
      } else if (mode === 'signup') {
        const result = await auth.signUp(address, password);
        if (!canFinish()) return;
        setPassword('');
        setConfirmation('');
        if (result?.requiresConfirmation) {
          setMode('signin');
          setMessage('Check your email to confirm your account, then sign in.');
        } else {
          onClose();
        }
      } else if (mode === 'reset') {
        await auth.sendPasswordReset(address);
        if (canFinish())
          setMessage('If an account uses this email, you will receive a password reset link.');
      } else {
        await auth.updatePassword(password);
        if (!canFinish()) return;
        setPassword('');
        setConfirmation('');
        setMode('account');
        setMessage('Your password has been updated.');
      }
    });
  };
  const socialSignIn = (provider) =>
    run(async (canFinish) => {
      const result = await auth.signInWithOAuth(provider);
      if (!result?.cancelled && canFinish()) onClose();
    });
  const button = (label, action, { secondary = false, danger = false, disabled = false } = {}) => (
    <Pressable
      accessibilityRole="button"
      disabled={!available || disabled}
      onPress={action}
      style={[
        styles.button,
        {
          backgroundColor: secondary ? theme.cardSecondary : danger ? theme.error : theme.accent,
          opacity: !available || disabled ? 0.45 : 1,
        },
      ]}
    >
      <Text
        style={{
          color: secondary ? theme.text : danger ? '#FFFFFF' : theme.accentText,
          fontWeight: '600',
          fontSize: 15,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
  const link = (label, action) => (
    <Pressable onPress={action} disabled={busy} accessibilityRole="button" style={styles.link}>
      <Text style={{ color: theme.accent, fontSize: 14, fontWeight: '500' }}>{label}</Text>
    </Pressable>
  );
  const label = (text) => (
    <Text style={[styles.label, { color: theme.textSecondary }]}>{text}</Text>
  );
  const title = {
    signin: 'Welcome to Sync',
    signup: 'Create an account',
    reset: 'Reset password',
    recovery: 'Choose a new password',
    account: 'Your account',
    delete: 'Delete account',
  }[mode];

  return (
    <Sheet
      visible={visible}
      title={title}
      onClose={busy || auth.socialProvider ? () => {} : onClose}
    >
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        {!auth.configured && (
          <Text style={[styles.prose, { color: theme.textSecondary }]}>
            Account services are being set up. You can keep using Sync on this device.
          </Text>
        )}
        {(mode === 'account' || mode === 'delete') && auth.user ? (
          <>
            <Text selectable style={[styles.email, { color: theme.text }]}>
              {auth.user.email}
            </Text>
            {mode === 'account' ? (
              <>
                <Text style={[styles.prose, { color: theme.textSecondary }]}>
                  Your saved data belongs to this account. Local routines and music remain available
                  without a subscription.
                </Text>
                {link('Manage Sync Pro', onManageSubscription)}
                {link('Reset password', () => changeMode('reset'))}
                {button(
                  'Sign out',
                  () =>
                    Alert.alert(
                      'Sign out?',
                      'Your account’s saved data stays separate from guest mode on this device.',
                      [
                        { text: 'Cancel', style: 'cancel' },
                        {
                          text: 'Sign out',
                          onPress: () =>
                            run(async (canFinish) => {
                              await auth.signOut();
                              if (canFinish()) onClose();
                            }),
                        },
                      ],
                    ),
                  { secondary: true },
                )}
                {link('Delete account…', () => changeMode('delete'))}
              </>
            ) : (
              <>
                <Text style={[styles.prose, { color: theme.textSecondary }]}>
                  This permanently deletes your Sync account and its cloud data. This cannot be
                  undone.
                  {'\n\n'}Deleting your account does not cancel an App Store or Google Play
                  subscription. Manage or cancel your subscription first.
                </Text>
                {link('Manage subscription', onManageSubscription)}
                {label('Type DELETE to confirm')}
                <TextInput
                  value={deleteText}
                  onChangeText={setDeleteText}
                  autoCorrect={false}
                  autoCapitalize="characters"
                  editable={!busy}
                  accessibilityLabel="Type DELETE to confirm account deletion"
                  style={inputStyle}
                />
                {button(
                  'Permanently delete account',
                  () =>
                    run(async (canFinish) => {
                      await auth.deleteAccount();
                      if (canFinish()) onClose();
                    }),
                  { danger: true, disabled: deleteText !== 'DELETE' },
                )}
                {link('Sign in again to verify your identity', () => changeMode('signin'))}
                {link('Keep my account', () => changeMode('account'))}
              </>
            )}
          </>
        ) : (
          <>
            <Text style={[styles.prose, { color: theme.textSecondary }]}>
              {mode === 'reset'
                ? 'We’ll send a link to safely reset your password.'
                : mode === 'recovery'
                  ? 'Set a new password for your Sync account.'
                  : 'Keep your account across devices. Your timer, music and local routines are always free.'}
            </Text>
            {(mode === 'signin' || mode === 'signup') && (
              <>
                <AppleSignInButton onPress={() => socialSignIn('apple')} disabled={!available} />
                {button('Continue with Google', () => socialSignIn('google'), { secondary: true })}
                <Text
                  style={[
                    styles.prose,
                    { color: theme.textSecondary, textAlign: 'center', marginTop: 20 },
                  ]}
                >
                  or use email
                </Text>
              </>
            )}
            {mode !== 'recovery' && (
              <>
                {label('Email')}
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  textContentType="emailAddress"
                  autoComplete="email"
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={available}
                  placeholder="you@example.com"
                  placeholderTextColor={theme.textTertiary}
                  accessibilityLabel="Email address"
                  style={inputStyle}
                />
              </>
            )}
            {mode !== 'reset' && (
              <>
                {label(mode === 'recovery' ? 'New password' : 'Password')}
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  textContentType={mode === 'signin' ? 'password' : 'newPassword'}
                  autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={available}
                  accessibilityLabel={mode === 'recovery' ? 'New password' : 'Password'}
                  style={inputStyle}
                />
              </>
            )}
            {(mode === 'signup' || mode === 'recovery') && (
              <>
                {label('Confirm password')}
                <TextInput
                  value={confirmation}
                  onChangeText={setConfirmation}
                  secureTextEntry
                  textContentType="newPassword"
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={available}
                  accessibilityLabel="Confirm password"
                  style={inputStyle}
                />
              </>
            )}
            {button(
              {
                signin: 'Sign in',
                signup: 'Create account',
                reset: 'Send reset link',
                recovery: 'Update password',
              }[mode] || 'Sign in',
              submit,
            )}
            {mode === 'signin' && (
              <>
                {link('Create an account', () => changeMode('signup'))}
                {link('Forgot password?', () => changeMode('reset'))}
                {link('Continue without an account', onClose)}
              </>
            )}
            {(mode === 'signup' || mode === 'reset') &&
              link('Back to sign in', () => changeMode('signin'))}
            {mode === 'signup' && (
              <Text style={[styles.prose, { color: theme.textSecondary, marginTop: 12 }]}>
                Confirm your email to finish creating your account. You choose when to import
                existing data from this device.
              </Text>
            )}
          </>
        )}
        {busy && (
          <ActivityIndicator
            style={{ marginTop: 16 }}
            color={theme.accent}
            accessibilityLabel="Working"
          />
        )}
        {!!message && (
          <Text accessibilityRole="alert" style={[styles.notice, { color: theme.accent }]}>
            {message}
          </Text>
        )}
        {!!error && (
          <Text accessibilityRole="alert" style={[styles.notice, { color: theme.error }]}>
            {error}
          </Text>
        )}
        <View style={styles.legal}>
          {[
            ['Privacy policy', process.env.EXPO_PUBLIC_PRIVACY_URL],
            ['Terms of use', process.env.EXPO_PUBLIC_TERMS_URL],
          ]
            .filter(([, url]) => /^https:\/\//i.test(url || ''))
            .map(([text, url]) => (
              <Pressable
                key={text}
                accessibilityRole="link"
                onPress={async () => {
                  try {
                    await Linking.openURL(url);
                  } catch {
                    setError('This page could not be opened. Please try again.');
                  }
                }}
                style={{ paddingVertical: 10 }}
              >
                <Text style={{ color: theme.textSecondary, fontSize: 12 }}>{text}</Text>
              </Pressable>
            ))}
        </View>
      </ScrollView>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 12 },
  prose: { fontSize: 14, lineHeight: 21, marginBottom: 12 },
  email: { fontSize: 17, fontWeight: '600', marginBottom: 12 },
  label: { fontSize: 12, fontWeight: '500', marginTop: 14, marginBottom: 8 },
  input: {
    fontSize: 16,
    minHeight: 52,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 15,
  },
  button: {
    minHeight: 52,
    marginTop: 18,
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  link: { minHeight: 44, paddingVertical: 13, alignItems: 'center' },
  notice: { fontSize: 14, lineHeight: 21, marginTop: 15 },
  legal: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 20,
    marginTop: 15,
  },
});

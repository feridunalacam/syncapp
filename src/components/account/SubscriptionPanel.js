import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import Sheet from '../common/Sheet';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { useSubscription } from '../../context/SubscriptionContext';

const privacyUrl = process.env.EXPO_PUBLIC_PRIVACY_URL;
const termsUrl = process.env.EXPO_PUBLIC_TERMS_URL;
const validLink = (url) => typeof url === 'string' && /^https:\/\/[^\s/]+(?:\/[^\s]*)?$/.test(url);

export default function SubscriptionPanel({ visible, onClose, onSignIn }) {
  const { theme } = useTheme();
  const { user } = useAuth();
  const subscription = useSubscription();
  const [selectedId, setSelectedId] = useState('$rc_annual');
  const [localMessage, setLocalMessage] = useState(null);
  const [working, setWorking] = useState(false);
  const operationRef = useRef(0);
  const userRef = useRef(user?.id);
  userRef.current = user?.id;
  const packages = subscription.packages || [];
  const selected = packages.find((pkg) => pkg.identifier === selectedId) || packages[0];
  const legalReady = validLink(privacyUrl) && validLink(termsUrl);
  const busy = subscription.loading || working;
  const localCopy =
    localMessage?.kind === 'pro' && (!subscription.isPro || !subscription.accessVerified)
      ? null
      : localMessage?.text;
  useEffect(() => {
    setLocalMessage(null);
    setWorking(false);
    return () => {
      operationRef.current++;
    };
  }, [visible, user?.id]);
  useEffect(() => {
    setLocalMessage((message) => (message?.kind === 'pro' ? null : message));
  }, [subscription.isPro, subscription.accessVerified]);
  const run = async (operation) => {
    const request = ++operationRef.current;
    const userId = user?.id;
    const current = () => request === operationRef.current && userRef.current === userId;
    setLocalMessage(null);
    setWorking(true);
    try {
      const result = await operation();
      if (!current()) return;
      if (result?.isPro)
        setLocalMessage({
          kind: 'pro',
          text: 'Pro membership found. Check the cloud backup status in Profile.',
        });
      else if (result?.pending)
        setLocalMessage({
          kind: 'pending',
          text: 'Purchase received. We are verifying your Pro access.',
        });
    } catch (error) {
      if (current() && !error?.userCancelled)
        setLocalMessage({
          kind: 'error',
          text: error?.message || 'Could not complete the request. Please try again.',
        });
    } finally {
      if (current()) setWorking(false);
    }
  };
  const text = (copy, style) => (
    <Text style={[styles.body, { color: theme.textSecondary }, style]}>{copy}</Text>
  );
  const action = (label, onPress, { primary = false, disabled = false } = {}) => (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || busy }}
      disabled={disabled || busy}
      onPress={onPress}
      style={[
        styles.action,
        {
          backgroundColor: primary ? theme.accent : theme.cardSecondary,
          opacity: disabled || busy ? 0.45 : 1,
        },
      ]}
    >
      <Text
        style={{ color: primary ? theme.accentText : theme.text, fontSize: 15, fontWeight: '600' }}
      >
        {label}
      </Text>
    </Pressable>
  );
  return (
    <Sheet
      visible={visible}
      title={subscription.isPro ? 'Sync Pro' : 'Make room for more'}
      onClose={onClose}
    >
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        <View style={[styles.badge, { backgroundColor: theme.accentLight }]}>
          <Ionicons name="cloud-outline" size={27} color={theme.accent} />
          <Text style={{ color: theme.accent, fontSize: 22, fontWeight: '700' }}>Sync Pro</Text>
        </View>
        <Text style={[styles.title, { color: theme.text }]}>
          {subscription.isPro ? 'Your Sync Pro membership.' : 'Keep your training with you.'}
        </Text>
        {text(
          'Back up your routines, activity and profile, sync them across your devices, and remove all ads.',
        )}
        {text(
          'Timer, music and local routines stay free. Free accounts may see ads before starting or after finishing a session, plus a labelled Discover banner. Ads never interrupt a running or paused session. Imported audio files remain on the device where you added them.',
        )}
        {subscription.isPro &&
          text(
            subscription.accessVerified
              ? `Pro access is verified${subscription.entitlement?.expires_at ? ` until ${new Date(subscription.entitlement.expires_at).toLocaleDateString()}` : ''}. Check Cloud backup in Profile for the latest sync status.`
              : 'Your Pro membership is active, but cloud access has not been verified. Refresh access before syncing. Your records remain on this device.',
            { color: theme.accent, fontWeight: '600' },
          )}
        {subscription.pending &&
          text(
            'Your store purchase is waiting for server verification. Refresh access in a moment.',
            { color: theme.accent },
          )}
        {!user ? (
          <>
            {text(
              'Sign in to keep a subscription connected to your account and restore it on another device.',
            )}
            {action('Sign in or create account', onSignIn, { primary: true, disabled: !onSignIn })}
          </>
        ) : !subscription.isPro ? (
          <>
            {packages.map((pkg) => {
              const annual = pkg.identifier === '$rc_annual';
              const isSelected = pkg.identifier === selected?.identifier;
              return (
                <Pressable
                  key={pkg.identifier}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: isSelected, disabled: busy }}
                  disabled={busy}
                  onPress={() => setSelectedId(pkg.identifier)}
                  style={[
                    styles.plan,
                    {
                      borderColor: isSelected ? theme.accent : theme.border,
                      backgroundColor: theme.cardSecondary,
                    },
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: theme.text, fontSize: 17, fontWeight: '600' }}>
                      {annual ? 'Annual' : 'Monthly'}
                    </Text>
                    {text(`${pkg.product.priceString} / ${annual ? 'year' : 'month'}`, {
                      marginBottom: 0,
                    })}
                  </View>
                  <Ionicons
                    name={isSelected ? 'radio-button-on' : 'radio-button-off'}
                    size={23}
                    color={isSelected ? theme.accent : theme.textTertiary}
                  />
                </Pressable>
              );
            })}
            {!subscription.ready && (
              <ActivityIndicator color={theme.accent} style={{ marginVertical: 15 }} />
            )}
            {subscription.ready &&
              !subscription.configured &&
              text(
                subscription.requiresRestart
                  ? 'Close Sync completely and reopen it to finish switching accounts before using purchases.'
                  : subscription.requiresNativeBuild
                    ? 'Purchases will be available after updating this app build.'
                    : 'Subscriptions are not available for purchase yet. Your free features are ready to use.',
              )}
            {subscription.ready &&
              subscription.configured &&
              packages.length === 0 &&
              text('No plans are available from the store right now. Please try again later.')}
            {!legalReady &&
              packages.length > 0 &&
              text('Subscriptions will open when the terms and privacy policy are available.')}
            {action(
              selected
                ? `Subscribe · ${selected.product.priceString} / ${selected.identifier === '$rc_annual' ? 'year' : 'month'}`
                : 'Subscribe to Pro',
              () => run(() => subscription.purchase(selected)),
              {
                primary: true,
                disabled:
                  !subscription.ready ||
                  !subscription.configured ||
                  !selected ||
                  !legalReady ||
                  subscription.pending,
              },
            )}
            {text(
              'Payment is charged to your store account. The subscription renews automatically unless cancelled in your store subscription settings before renewal. Access continues through the paid period after cancellation.',
              styles.fine,
            )}
          </>
        ) : null}
        {!!user && (
          <>
            {action('Refresh access', () => run(subscription.refresh), {
              disabled: !subscription.ready,
            })}
            {action('Restore purchases', () => run(subscription.restore), {
              disabled: !subscription.configured || !subscription.ready,
            })}
            {text(
              'Restoring a store purchase may move Pro access to this Sync account. If access moves, the previous account loses Pro access. Each account keeps its own separate cloud data.',
              styles.fine,
            )}
            {action('Manage subscription', () => run(subscription.manage))}
          </>
        )}
        {busy && <ActivityIndicator color={theme.accent} style={{ marginTop: 14 }} />}
        {(subscription.error || localCopy) && (
          <Text
            accessibilityRole="alert"
            style={[styles.body, { color: theme.text, marginTop: 16 }]}
          >
            {subscription.error || localCopy}
          </Text>
        )}
        <View style={styles.legal}>
          {validLink(termsUrl) && (
            <Pressable
              accessibilityRole="link"
              onPress={() => run(() => Linking.openURL(termsUrl))}
            >
              <Text style={{ color: theme.accent }}>Terms of use</Text>
            </Pressable>
          )}
          {validLink(privacyUrl) && (
            <Pressable
              accessibilityRole="link"
              onPress={() => run(() => Linking.openURL(privacyUrl))}
            >
              <Text style={{ color: theme.accent }}>Privacy policy</Text>
            </Pressable>
          )}
        </View>
      </ScrollView>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 12 },
  badge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderRadius: 18,
    marginBottom: 20,
  },
  title: { fontSize: 28, fontWeight: '700', lineHeight: 34, marginBottom: 12 },
  body: { fontSize: 14, lineHeight: 21, marginBottom: 13 },
  plan: {
    padding: 17,
    borderWidth: 1.5,
    borderRadius: 18,
    marginTop: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  action: {
    paddingVertical: 16,
    paddingHorizontal: 15,
    borderRadius: 18,
    alignItems: 'center',
    marginTop: 12,
  },
  fine: { fontSize: 11, lineHeight: 17, marginTop: 13 },
  legal: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 22,
    marginTop: 20,
  },
});

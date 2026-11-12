import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import * as Crypto from 'expo-crypto';

export function getNativeAppleAuthentication() {
  if (Platform.OS !== 'ios' || !requireOptionalNativeModule('ExpoAppleAuthentication')) return null;
  return require('expo-apple-authentication');
}

export async function signInNativeApple() {
  const apple = getNativeAppleAuthentication();
  if (!apple || !(await apple.isAvailableAsync())) return null;
  const nonce = Array.from(Crypto.getRandomBytes(32), (value) =>
    value.toString(16).padStart(2, '0'),
  ).join('');
  const state = Crypto.randomUUID();
  try {
    const credential = await apple.signInAsync({
      requestedScopes: [apple.AppleAuthenticationScope.EMAIL],
      nonce: await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, nonce),
      state,
    });
    if (!credential.identityToken || credential.state !== state)
      throw new Error('Invalid Apple response');
    return { token: credential.identityToken, nonce };
  } catch (error) {
    if (error.code === 'ERR_REQUEST_CANCELED') return { cancelled: true };
    throw new Error('Apple sign-in could not be completed. Please try again.');
  }
}

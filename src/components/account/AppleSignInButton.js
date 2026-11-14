import React from 'react';
import { View, Pressable, Text } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { getNativeAppleAuthentication } from '../../services/auth/apple';

export default function AppleSignInButton({ onPress, disabled }) {
  const { isDark, theme } = useTheme();
  const apple = getNativeAppleAuthentication();
  return (
    <View
      style={{ marginTop: 18, opacity: disabled ? 0.45 : 1 }}
      pointerEvents={disabled ? 'none' : 'auto'}
      accessibilityState={{ disabled }}
    >
      {apple ? (
        <apple.AppleAuthenticationButton
          buttonType={apple.AppleAuthenticationButtonType.CONTINUE}
          buttonStyle={
            isDark
              ? apple.AppleAuthenticationButtonStyle.WHITE
              : apple.AppleAuthenticationButtonStyle.BLACK
          }
          cornerRadius={19}
          style={{ width: '100%', height: 52 }}
          onPress={onPress}
          accessibilityLabel="Continue with Apple"
        />
      ) : (
        <Pressable
          onPress={onPress}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel="Continue with Apple"
          style={{
            height: 52,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 19,
            backgroundColor: theme.cardSecondary,
          }}
        >
          <Text style={{ color: theme.text, fontSize: 15, fontWeight: '600' }}>
            Continue with Apple
          </Text>
        </Pressable>
      )}
    </View>
  );
}

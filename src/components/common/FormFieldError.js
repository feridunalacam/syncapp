import React from 'react';
import { Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '../../context/ThemeContext';

/**
 * Inline error message rendered directly under a form input. Renders nothing
 * when `message` is falsy so callers can plug it in without conditional JSX.
 */
const FormFieldError = ({ message, style }) => {
  const { theme } = useTheme();
  if (!message) return null;
  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          marginTop: theme.spacing.xs,
          gap: theme.spacing.xs,
        },
        style,
      ]}
      accessibilityLiveRegion="polite"
    >
      <Ionicons
        name="alert-circle-outline"
        size={theme.iconSize.sm}
        color={theme.error}
      />
      <Text
        style={{
          color: theme.error,
          fontSize: theme.fontSize.sm,
          flex: 1,
        }}
      >
        {message}
      </Text>
    </View>
  );
};

export default FormFieldError;

import React from 'react';
import { View, Text, ActivityIndicator, TouchableOpacity } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '../../context/ThemeContext';

/**
 * Centered placeholder for "list is empty" / "no results found" states.
 *
 * Props:
 *   - icon       : Ionicons name (default: "file-tray-outline")
 *   - title      : main message
 *   - description: secondary message (optional)
 *   - actionLabel: optional CTA button text
 *   - onAction   : callback for the CTA
 */
export const EmptyState = ({
  icon = 'file-tray-outline',
  title,
  description,
  actionLabel,
  onAction,
  style,
}) => {
  const { theme } = useTheme();
  return (
    <View
      style={[
        {
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          padding: theme.spacing['2xl'],
        },
        style,
      ]}
    >
      <View
        style={{
          width: 64,
          height: 64,
          borderRadius: theme.radius.full,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: theme.cardSecondary,
          marginBottom: theme.spacing.lg,
        }}
      >
        <Ionicons name={icon} size={theme.iconSize.xl} color={theme.iconSecondary} />
      </View>
      {title ? (
        <Text
          style={{
            fontSize: theme.fontSize.lg,
            fontWeight: theme.fontWeight.semibold,
            color: theme.text,
            textAlign: 'center',
            marginBottom: description ? theme.spacing.sm : 0,
          }}
        >
          {title}
        </Text>
      ) : null}
      {description ? (
        <Text
          style={{
            fontSize: theme.fontSize.base,
            color: theme.textSecondary,
            textAlign: 'center',
            lineHeight: 22,
            maxWidth: 280,
          }}
        >
          {description}
        </Text>
      ) : null}
      {actionLabel && onAction ? (
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          onPress={onAction}
          style={{
            marginTop: theme.spacing['2xl'],
            paddingVertical: theme.spacing.md,
            paddingHorizontal: theme.spacing['2xl'],
            borderRadius: theme.radius.full,
            backgroundColor: theme.buttonPrimary,
          }}
        >
          <Text
            style={{
              color: theme.buttonText,
              fontSize: theme.fontSize.md,
              fontWeight: theme.fontWeight.semibold,
            }}
          >
            {actionLabel}
          </Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
};

/**
 * Centered spinner with optional label. Used while async data is loading.
 */
export const LoadingState = ({ label, style }) => {
  const { theme } = useTheme();
  return (
    <View
      style={[
        {
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          padding: theme.spacing['2xl'],
        },
        style,
      ]}
    >
      <ActivityIndicator size="small" color={theme.accent} />
      {label ? (
        <Text
          style={{
            marginTop: theme.spacing.md,
            color: theme.textSecondary,
            fontSize: theme.fontSize.base,
          }}
        >
          {label}
        </Text>
      ) : null}
    </View>
  );
};

/**
 * Centered error placeholder with an optional retry button.
 */
export const ErrorState = ({
  title = 'Something went wrong',
  description,
  retryLabel = 'Try again',
  onRetry,
  style,
}) => {
  const { theme } = useTheme();
  return (
    <View
      style={[
        {
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          padding: theme.spacing['2xl'],
        },
        style,
      ]}
    >
      <View
        style={{
          width: 64,
          height: 64,
          borderRadius: theme.radius.full,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: theme.cardSecondary,
          marginBottom: theme.spacing.lg,
        }}
      >
        <Ionicons name="alert-circle-outline" size={theme.iconSize.xl} color={theme.error} />
      </View>
      <Text
        style={{
          fontSize: theme.fontSize.lg,
          fontWeight: theme.fontWeight.semibold,
          color: theme.text,
          textAlign: 'center',
          marginBottom: description ? theme.spacing.sm : 0,
        }}
      >
        {title}
      </Text>
      {description ? (
        <Text
          style={{
            fontSize: theme.fontSize.base,
            color: theme.textSecondary,
            textAlign: 'center',
            lineHeight: 22,
            maxWidth: 280,
          }}
        >
          {description}
        </Text>
      ) : null}
      {onRetry ? (
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={retryLabel}
          onPress={onRetry}
          style={{
            marginTop: theme.spacing['2xl'],
            paddingVertical: theme.spacing.md,
            paddingHorizontal: theme.spacing['2xl'],
            borderRadius: theme.radius.full,
            borderWidth: 1,
            borderColor: theme.border,
          }}
        >
          <Text
            style={{
              color: theme.text,
              fontSize: theme.fontSize.md,
              fontWeight: theme.fontWeight.semibold,
            }}
          >
            {retryLabel}
          </Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
};

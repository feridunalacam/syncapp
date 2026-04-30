import React from 'react';
import { Text } from 'react-native';
import { useTheme } from '../../context/ThemeContext';

/**
 * Heading — semantic title text. Variant controls size + weight.
 *
 * Variants:
 *   - "page"    : large screen title (e.g. "Routines", "Log").
 *   - "section" : section title inside a screen (e.g. "Statistics", "My posts").
 *   - "card"    : title inside a card / row.
 */
export const Heading = ({ variant = 'section', style, children, ...rest }) => {
  const { theme } = useTheme();
  const variantStyle = HEADING_VARIANTS[variant] || HEADING_VARIANTS.section;
  return (
    <Text
      accessibilityRole="header"
      style={[
        {
          color: theme.text,
          fontSize: theme.fontSize[variantStyle.fontSize],
          fontWeight: theme.fontWeight[variantStyle.fontWeight],
        },
        style,
      ]}
      {...rest}
    >
      {children}
    </Text>
  );
};

const HEADING_VARIANTS = {
  page: { fontSize: '4xl', fontWeight: 'bold' },
  section: { fontSize: 'xl', fontWeight: 'bold' },
  card: { fontSize: 'md', fontWeight: 'semibold' },
};

/**
 * SectionLabel — small uppercase caption used to introduce a group of rows
 * (e.g. "ACCOUNT", "PREFERENCES" on the Profile screen).
 */
export const SectionLabel = ({ style, children, ...rest }) => {
  const { theme } = useTheme();
  return (
    <Text
      style={[
        {
          fontSize: theme.fontSize.sm,
          fontWeight: theme.fontWeight.semibold,
          color: theme.textSecondary,
          letterSpacing: 0.5,
          textTransform: 'uppercase',
        },
        style,
      ]}
      {...rest}
    >
      {children}
    </Text>
  );
};

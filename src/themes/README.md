# Theme System

This app uses a centralized theme system for dark mode support.

## Structure

- **`src/themes/lightTheme.js`** - Light theme color definitions
- **`src/themes/darkTheme.js`** - Dark theme color definitions
- **`src/context/ThemeContext.js`** - Theme context provider and hook

## Usage

### In Components

```javascript
import { useTheme } from '../context/ThemeContext';

function MyComponent() {
  const { theme, isDark, toggleTheme, setTheme } = useTheme();
  
  return (
    <View style={{ backgroundColor: theme.background }}>
      <Text style={{ color: theme.text }}>Hello World</Text>
      <TouchableOpacity onPress={toggleTheme}>
        <Text>Toggle Dark Mode</Text>
      </TouchableOpacity>
    </View>
  );
}
```

### Theme Properties

- `theme` - Current theme object with all color definitions
- `themeMode` - Current mode: `'light'` or `'dark'`
- `isDark` - Boolean indicating if dark mode is active
- `toggleTheme()` - Function to toggle between light and dark mode
- `setTheme(mode)` - Function to set theme explicitly (`'light'` or `'dark'`)
- `isLoading` - Boolean indicating if theme is still loading from storage

### Available Theme Colors

- `background` - Main background color
- `surface` - Surface/card background
- `card` - Card background
- `text` - Primary text color
- `textSecondary` - Secondary text color
- `textTertiary` - Tertiary text color
- `border` - Border color
- `buttonPrimary` - Primary button color
- `buttonSecondary` - Secondary button color
- And more...

## Toggle Location

The dark mode toggle is available in the Profile screen under "Quick Settings".


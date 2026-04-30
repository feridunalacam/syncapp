import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { lightTheme } from '../themes/lightTheme';
import { darkTheme } from '../themes/darkTheme';
import storage, { STORAGE_KEYS } from '../lib/storage';

const ThemeContext = createContext();

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

export const ThemeProvider = ({ children }) => {
  const [themeMode, setThemeMode] = useState('light'); // 'light' or 'dark'
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const savedTheme = await storage.getString(STORAGE_KEYS.THEME_MODE);
      if (!cancelled && (savedTheme === 'light' || savedTheme === 'dark')) {
        setThemeMode(savedTheme);
      }
      if (!cancelled) {
        setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setTheme = useCallback(async (mode) => {
    if (mode !== 'light' && mode !== 'dark') return;
    setThemeMode(mode);
    await storage.setString(STORAGE_KEYS.THEME_MODE, mode);
  }, []);

  const toggleTheme = useCallback(async () => {
    const newTheme = themeMode === 'light' ? 'dark' : 'light';
    await setTheme(newTheme);
  }, [themeMode, setTheme]);

  const value = useMemo(() => {
    const isDark = themeMode === 'dark';
    return {
      theme: isDark ? darkTheme : lightTheme,
      themeMode,
      isDark,
      toggleTheme,
      setTheme,
      isLoading,
    };
  }, [themeMode, toggleTheme, setTheme, isLoading]);

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
};

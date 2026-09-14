import React, { useState } from 'react';
import { View, Text, Pressable, ScrollView, Keyboard, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { WebView } from 'react-native-webview';
import { useTheme } from '../../../../context/ThemeContext';
import { useMediaWebView } from './useMediaWebView';
import { BOOKMARK_SITES, MEDIA_DETECTION_SCRIPT } from './constants';
import { SearchField, MusicRow, PrimaryAction, PickerState } from './MusicPickerParts';

export default function BrowserAudioPanel({ picker }) {
  const { theme } = useTheme();
  const browser = useMediaWebView({ active: true });
  const [address, setAddress] = useState(browser.browserUrl);
  const [pageError, setPageError] = useState(false);
  const [selected, setSelected] = useState(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const open = (value) => {
    let url = value.trim();
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    try {
      const parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol)) return;
    } catch {
      return;
    }
    setSelected(null);
    browser.setDetectedMedia([]);
    browser.setBrowserUrl(url);
    setAddress(url);
    setPageError(false);
    Keyboard.dismiss();
  };
  if (selected)
    return (
      <View style={{ flex: 1, paddingTop: 18 }}>
        <Pressable
          onPress={() => setSelected(null)}
          accessibilityLabel="Back to browser"
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 12 }}
        >
          <Ionicons name="chevron-back" size={18} color={theme.accent} />
          <Text style={{ color: theme.accent }}>Browser</Text>
        </Pressable>
        <Text
          numberOfLines={2}
          style={{ color: theme.text, fontSize: 21, fontWeight: '600', marginVertical: 16 }}
        >
          {selected.name}
        </Text>
        <Text
          style={{ color: theme.textSecondary, fontSize: 13, lineHeight: 20, marginBottom: 20 }}
        >
          Download a copy for offline use, or play from its web address.
        </Text>
        <PrimaryAction
          label="Download & add"
          icon="download-outline"
          onPress={() => picker.downloadFromUrl(selected.url, selected.name)}
          loading={picker.isDownloading}
        />
        <View style={{ height: 10 }} />
        <PrimaryAction
          label="Use web audio"
          icon="link-outline"
          onPress={() => picker.addFromUrl(selected.url, selected.name)}
          disabled={picker.isDownloading}
        />
      </View>
    );
  return (
    <View style={{ flex: 1 }}>
      <SearchField
        value={address}
        onChange={setAddress}
        placeholder="Website address"
        keyboardType="url"
        onSubmit={() => open(address)}
      />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0, marginBottom: 12 }}
        contentContainerStyle={{ gap: 8 }}
      >
        {BOOKMARK_SITES.map((site) => (
          <Pressable
            key={site.name}
            onPress={() => open(site.url)}
            style={{
              paddingHorizontal: 13,
              paddingVertical: 9,
              borderRadius: 13,
              backgroundColor: theme.cardSecondary,
            }}
          >
            <Text style={{ color: theme.textSecondary, fontSize: 12 }}>{site.name}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <View
        style={{
          flex: 1,
          minHeight: 180,
          borderRadius: 19,
          overflow: 'hidden',
          backgroundColor: theme.cardSecondary,
        }}
      >
        {pageError ? (
          <PickerState
            title="This page could not load."
            onRetry={() => {
              setPageError(false);
              browser.webViewRef.current?.reload();
            }}
          />
        ) : (
          <WebView
            ref={browser.webViewRef}
            source={{ uri: browser.browserUrl }}
            onError={() => setPageError(true)}
            onNavigationStateChange={(state) => {
              setCanGoBack(state.canGoBack);
              if (state.loading) browser.setDetectedMedia([]);
              if (state.url) setAddress(state.url);
            }}
            onLoadStart={() => {
              browser.setDetectedMedia([]);
              if (browser.scanIntervalRef.current) clearInterval(browser.scanIntervalRef.current);
            }}
            onLoadEnd={() => {
              browser.webViewRef.current?.injectJavaScript(MEDIA_DETECTION_SCRIPT);
              if (browser.scanIntervalRef.current) clearInterval(browser.scanIntervalRef.current);
              browser.scanIntervalRef.current = setInterval(
                () => browser.webViewRef.current?.injectJavaScript(MEDIA_DETECTION_SCRIPT),
                2000,
              );
            }}
            onMessage={browser.handleWebViewMessage}
            javaScriptEnabled
            domStorageEnabled
            allowsInlineMediaPlayback
          />
        )}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 15 }}>
        <Pressable
          disabled={!canGoBack}
          onPress={() => browser.webViewRef.current?.goBack()}
          accessibilityLabel="Previous web page"
          hitSlop={8}
        >
          <Ionicons
            name="chevron-back"
            size={20}
            color={canGoBack ? theme.text : theme.textTertiary}
          />
        </Pressable>
        <Pressable
          onPress={() => browser.webViewRef.current?.reload()}
          accessibilityLabel="Reload web page"
          hitSlop={8}
        >
          <Ionicons name="reload" size={18} color={theme.text} />
        </Pressable>
        <Text style={{ flex: 1, textAlign: 'right', color: theme.textSecondary, fontSize: 11 }}>
          {browser.detectedMedia.length
            ? `${browser.detectedMedia.length} audio files found`
            : 'Open a page with an audio file'}
        </Text>
      </View>
      <ScrollView style={{ maxHeight: 150 }}>
        {browser.detectedMedia.map((media) => (
          <MusicRow
            key={media.url}
            item={{ name: media.name }}
            detail="Web audio"
            onPress={() => setSelected(media)}
          />
        ))}
      </ScrollView>
    </View>
  );
}

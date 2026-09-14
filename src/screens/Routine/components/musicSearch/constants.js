import { CUE_SOUND_OPTIONS } from '../../../../services/alerts/assets';
/**
 * Constants used by the music search modal and its sub-hooks.
 *
 * Kept separate so the modal component itself stays focused on rendering
 * and orchestration, and so each constant can be unit-tested without
 * pulling in React or any native modules.
 */

export const AUDIO_MIME_TYPES = [
  'audio/mpeg',
  'audio/mp4',
  'audio/x-m4a',
  'audio/aac',
  'audio/wav',
  'audio/x-wav',
  'audio/flac',
  'audio/ogg',
  'audio/webm',
];

export const VIDEO_MIME_TYPES = [
  'video/mp4',
  'video/quicktime',
  'video/x-msvideo',
  'video/x-matroska',
  'video/webm',
  'video/3gpp',
];

export const VIDEO_FILE_EXTENSIONS = ['mp4', 'mov', 'avi', 'mkv', 'm4v', 'webm'];

export const BOOKMARK_SITES = [
  { url: 'https://mixkit.co/free-sound-effects/', name: 'Mixkit', color: '#FF6B35' },
  { url: 'https://pixabay.com/sound-effects/', name: 'Pixabay', color: '#00AB6C' },
  { url: 'https://freesound.org/', name: 'Freesound', color: '#1E88E5' },
  { url: 'https://www.zapsplat.com/', name: 'ZapSplat', color: '#9C27B0' },
];

export const DEFAULT_BROWSER_URL = 'https://mixkit.co/free-sound-effects/';

// New selections use the verified, distinct effect files. Existing routine URIs
// still resolve through the legacy player without relabeling old recordings.
export const DEFAULT_VOICES = CUE_SOUND_OPTIONS.map((sound) => ({ ...sound, type: 'voice' }));

/**
 * Browser-injected JS that scans the current page for downloadable audio /
 * video and posts the list back via `window.ReactNativeWebView.postMessage`.
 * Kept as a constant so it can be evolved independently from the modal UI.
 */
export const MEDIA_DETECTION_SCRIPT = `
  (function() {
    const mediaExtensions = ['mp3', 'm4a', 'wav', 'aac', 'ogg', 'flac', 'mp4', 'mov', 'webm', 'avi'];
    const mediaFiles = [];

    const isMediaUrl = (url) => {
      if (!url) return false;
      const lower = url.toLowerCase();
      return mediaExtensions.some(ext => lower.includes('.' + ext));
    };

    const getCleanName = (url, text) => {
      let name = text || '';
      if (!name || name.length < 2) {
        name = decodeURIComponent(url.split('/').pop().split('?')[0] || 'Audio');
      }
      return name.replace(/\\.[^/.]+$/, '').substring(0, 60);
    };

    document.querySelectorAll('a[href]').forEach(link => {
      if (isMediaUrl(link.href)) {
        mediaFiles.push({ url: link.href, name: getCleanName(link.href, link.textContent.trim()) });
      }
    });

    document.querySelectorAll('audio, video').forEach(el => {
      const src = el.src || el.currentSrc;
      if (src) mediaFiles.push({ url: src, name: getCleanName(src, '') });
      el.querySelectorAll('source').forEach(s => {
        if (s.src) mediaFiles.push({ url: s.src, name: getCleanName(s.src, '') });
      });
    });

    document.querySelectorAll('[download], [data-download], .download').forEach(el => {
      const href = el.href || el.getAttribute('data-href');
      if (href && isMediaUrl(href)) {
        mediaFiles.push({ url: href, name: getCleanName(href, el.textContent.trim()) });
      }
    });

    const unique = [...new Map(mediaFiles.map(item => [item.url, item])).values()];
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'media', data: unique.slice(0, 30) }));
  })();
  true;
`;

/**
 * Build a normalized song object from a heterogeneous picker source. The
 * audio controller and routine save flow expect this exact shape.
 */
export const createSongObject = (config) => ({
  id: config.id || `${config.source}-${Date.now()}`,
  name: config.name,
  artist: config.artist || 'Unknown',
  album: config.album || null,
  image: config.image || null,
  duration: config.duration || 0,
  uri: config.uri,
  type: config.type || 'track',
  source: config.source,
  platform: config.platform || 'device',
  ...(config.isVideo && { isVideo: true }),
});

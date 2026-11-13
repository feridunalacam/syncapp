/** Capabilities describe Sync's actual integration, not a provider's marketing API. */
export const MUSIC_PROVIDERS = {
  spotify: {
    id: 'spotify',
    name: 'Spotify',
    color: '#1DB954',
    icon: 'musical-notes-outline',
    mode: 'external',
    url: 'https://open.spotify.com/',
    hosts: ['open.spotify.com', 'spotify.link'],
    description: 'Open Spotify to listen. Playback stays in Spotify.',
  },
  appleMusic: {
    id: 'appleMusic',
    name: 'Apple Music',
    color: '#FA445A',
    icon: 'logo-apple',
    mode: 'native',
    url: 'https://music.apple.com/',
    hosts: ['music.apple.com'],
    description:
      'Connect on iOS to choose and play songs and playlists. Your selected alerts briefly pause music. An Apple Music subscription is required.',
  },
  youtubeMusic: {
    id: 'youtubeMusic',
    name: 'YouTube Music',
    color: '#FF0033',
    icon: 'logo-youtube',
    mode: 'external',
    url: 'https://music.youtube.com/',
    hosts: ['music.youtube.com', 'www.youtube.com', 'youtube.com', 'youtu.be'],
    description: 'Listen in YouTube Music. Playback and work/rest song changes stay in that app.',
  },
  tidal: {
    id: 'tidal',
    name: 'TIDAL',
    color: '#A4A8AC',
    icon: 'musical-notes-outline',
    mode: 'external',
    url: 'https://listen.tidal.com/',
    hosts: ['listen.tidal.com', 'tidal.com', 'www.tidal.com'],
    description: 'Open TIDAL to listen. Playback stays in TIDAL.',
  },
  soundcloud: {
    id: 'soundcloud',
    name: 'SoundCloud',
    color: '#FF5500',
    icon: 'logo-soundcloud',
    mode: 'external',
    url: 'https://soundcloud.com/',
    hosts: ['soundcloud.com', 'www.soundcloud.com', 'on.soundcloud.com'],
    description: 'Open SoundCloud to listen. Playback stays in SoundCloud.',
  },
  deezer: {
    id: 'deezer',
    name: 'Deezer',
    color: '#A238FF',
    icon: 'musical-notes-outline',
    mode: 'external',
    url: 'https://www.deezer.com/',
    hosts: ['deezer.com', 'www.deezer.com', 'link.deezer.com'],
    description: 'Open Deezer to listen. Playback stays in Deezer.',
  },
  amazonMusic: {
    id: 'amazonMusic',
    name: 'Amazon Music',
    color: '#25D1DA',
    icon: 'musical-notes-outline',
    mode: 'external',
    url: 'https://music.amazon.com/',
    hosts: [
      'music.amazon.com',
      'music.amazon.co.uk',
      'music.amazon.de',
      'music.amazon.fr',
      'music.amazon.co.jp',
    ],
    description: 'Open Amazon Music to listen. Playback stays in Amazon Music.',
  },
  audius: {
    id: 'audius',
    name: 'Audius',
    color: '#CC3DFF',
    icon: 'musical-notes-outline',
    mode: 'external',
    url: 'https://audius.co/',
    hosts: ['audius.co', 'www.audius.co'],
    description: 'Open Audius to listen. Playback stays in Audius.',
  },
};

export function resolveMusicLink(input = '', providerId = null) {
  if (typeof input !== 'string' || input.length > 2048) return null;
  const provider = MUSIC_PROVIDERS[providerId];
  if (!input?.trim() && provider) return { provider, url: provider.url };
  let url;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
  const match = (provider ? [provider] : Object.values(MUSIC_PROVIDERS)).find((item) =>
    item.hosts.includes(url.hostname.toLowerCase()),
  );
  return match ? { provider: match, url: url.href } : null;
}

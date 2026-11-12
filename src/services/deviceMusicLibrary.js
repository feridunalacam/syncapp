import * as MediaLibrary from 'expo-media-library';

// Called only after the user explicitly chooses the device library.
export async function loadDeviceMusic() {
  const { status } = await MediaLibrary.requestPermissionsAsync(false, ['audio']);
  if (status !== 'granted') {
    const error = new Error('Permission denied');
    error.userMessage = 'Library access is off. You can still import from Files.';
    throw error;
  }
  const assets = [];
  let after;
  do {
    const page = await MediaLibrary.getAssetsAsync({
      mediaType: MediaLibrary.MediaType.audio,
      first: 200,
      after,
      sortBy: MediaLibrary.SortBy.modificationTime,
    });
    assets.push(...page.assets);
    after = page.hasNextPage ? page.endCursor : undefined;
  } while (after);
  return assets.map((asset) => ({
    id: asset.id,
    name: asset.filename.replace(/\.[^/.]+$/, ''),
    artist: 'Device library',
    duration: asset.duration,
    uri: asset.uri,
    type: 'track',
    platform: 'device',
    source: 'device',
  }));
}

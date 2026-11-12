import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import { createAppleMusicService } from './adapter';
import { APPLE_MUSIC_AVAILABLE, APPLE_MUSIC_UNAVAILABLE_MESSAGE } from './config';

const native =
  APPLE_MUSIC_AVAILABLE && Platform.OS === 'ios'
    ? requireOptionalNativeModule('SyncAppleMusic')
    : null;
export default createAppleMusicService(native, {
  unavailableMessage: APPLE_MUSIC_AVAILABLE ? undefined : APPLE_MUSIC_UNAVAILABLE_MESSAGE,
});

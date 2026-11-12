import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import { createAppleMusicService } from './adapter';
import {
  APPLE_MUSIC_AVAILABLE,
  APPLE_MUSIC_COMPANION_AVAILABLE,
  APPLE_MUSIC_UNAVAILABLE_MESSAGE,
} from './config';

const native =
  (APPLE_MUSIC_AVAILABLE || APPLE_MUSIC_COMPANION_AVAILABLE) && Platform.OS === 'ios'
    ? requireOptionalNativeModule('SyncAppleMusic')
    : null;
export const appleMusicCompanionService = createAppleMusicService(
  APPLE_MUSIC_COMPANION_AVAILABLE ? native : null,
);
export default createAppleMusicService(APPLE_MUSIC_AVAILABLE ? native : null, {
  unavailableMessage: APPLE_MUSIC_AVAILABLE ? undefined : APPLE_MUSIC_UNAVAILABLE_MESSAGE,
});

import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import { createAppleMusicService } from './adapter';

const native = Platform.OS === 'ios' ? requireOptionalNativeModule('SyncAppleMusic') : null;
export default createAppleMusicService(native);

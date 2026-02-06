import { PermissionsAndroid, Platform } from 'react-native';

export const requestBlePermissions = async (): Promise<boolean> => {
  if (Platform.OS !== 'android') {
    console.log('[PERM] Non-Android platform — permissions granted by default');
    return true;
  }

  try {
    const apiLevel = Number(Platform.Version);
    console.log('[PERM] requestBlePermissions() — API level:', apiLevel);

    // Android 12+ (API 31+)
    if (apiLevel >= 31) {
      const permissions = [
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE,
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      ];

      console.log('[PERM] Requesting Android 12+ permissions:', permissions.length, 'items');
      const result = await PermissionsAndroid.requestMultiple(permissions);
      console.log('[PERM] Android 12+ permission results:', JSON.stringify(result));

      const allGranted = permissions.every(
        permission => result[permission] === PermissionsAndroid.RESULTS.GRANTED
      );
      console.log('[PERM] All permissions granted:', allGranted);
      return allGranted;
    }

    // Android 6–11 (API 23–30)
    console.log('[PERM] Requesting Android 6-11 location permissions');
    const result = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
    ]);
    console.log('[PERM] Android 6-11 permission results:', JSON.stringify(result));

    const granted =
      result[PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION] === PermissionsAndroid.RESULTS.GRANTED ||
      result[PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION] === PermissionsAndroid.RESULTS.GRANTED;
    console.log('[PERM] Location permission granted:', granted);
    return granted;
  } catch (error) {
    console.error('[PERM] BLE permission request failed:', error);
    return false;
  }
};

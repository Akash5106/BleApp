import { PermissionsAndroid, Platform } from 'react-native';

export const requestBlePermissions = async (): Promise<boolean> => {
  if (Platform.OS !== 'android') return true;

  try {
    const apiLevel = Number(Platform.Version);

    // Android 12+ (API 31+)
    if (apiLevel >= 31) {
      const permissions = [
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE,
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      ];

      const result = await PermissionsAndroid.requestMultiple(permissions);

      return permissions.every(
        permission => result[permission] === PermissionsAndroid.RESULTS.GRANTED
      );
    }

    // Android 6–11 (API 23–30)
    const result = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
    ]);

    return (
      result[PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION] === PermissionsAndroid.RESULTS.GRANTED ||
      result[PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION] === PermissionsAndroid.RESULTS.GRANTED
    );
  } catch (error) {
    console.error('❌ BLE permission request failed:', error);
    return false;
  }
};

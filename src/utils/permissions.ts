import { PermissionsAndroid, Platform } from 'react-native';

export const requestBlePermissions = async () => {
  if (Platform.OS !== 'android') return true;

  try {
    const apiLevel = parseInt(Platform.Version.toString(), 10);

    if (apiLevel >= 31) {
      const result = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE,
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      ]);

      return (
        result['android.permission.BLUETOOTH_CONNECT'] === 'granted' &&
        result['android.permission.BLUETOOTH_ADVERTISE'] === 'granted' &&
        result['android.permission.BLUETOOTH_SCAN'] === 'granted'
      );
    }

    // Android 11 and below
    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
    );
    return granted === PermissionsAndroid.RESULTS.GRANTED;
  } catch (err) {
    return false;
  }
};
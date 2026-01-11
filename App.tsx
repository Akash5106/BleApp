import React from 'react';
import {
  View,
  Button,
  PermissionsAndroid,
  NativeModules,
  Alert,
  Platform,
} from 'react-native';

const { BleAdvertiser } = NativeModules;

/**
 * Request all required Bluetooth permissions (Android 12+ safe)
 */
async function requestPerms() {
  if (Platform.OS !== 'android') return;

  const result = await PermissionsAndroid.requestMultiple([
    PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE,
    PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
    PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
  ]);

  console.log('Permission result:', result);
}

/**
 * Start BLE advertising (Promise-safe)
 */
async function startAdvertising() {
  try {
    const res = await BleAdvertiser.startAdvertising();
    Alert.alert('BLE', res);
    console.log("Button Pressed");
  } catch (e: any) {
    Alert.alert('BLE Error', e?.message ?? 'Unknown error');
  }
}

/**
 * Stop BLE advertising (Promise-safe)
 */
async function stopAdvertising() {
  try {
    const res = await BleAdvertiser.stopAdvertising();
    Alert.alert('BLE', res);
  } catch (e: any) {
    Alert.alert('BLE Error', e?.message ?? 'Unknown error');
  }
}

export default function App() {
  return (
    <View
      style={{
        flex: 1,
        justifyContent: 'center',
        paddingHorizontal: 20,
        gap: 12,
      }}
    >
      <Button title="Request Permissions" onPress={requestPerms} />
      <Button title="Start Advertising" onPress={startAdvertising} />
      <Button title="Stop Advertising" onPress={stopAdvertising} />
    </View>
  );
}

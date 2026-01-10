import React from 'react';
import {
  View,
  Button,
  PermissionsAndroid,
  NativeModules,
  Alert,
} from 'react-native';

const { BleAdvertiser } = NativeModules;

async function requestPerms() {
  await PermissionsAndroid.requestMultiple([
    PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE,
    PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
    PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
  ]);
}

export default function App() {
  return (
    <View style={{ flex: 1, justifyContent: 'center' }}>
      <Button title="Request Permission" onPress={requestPerms} />
      <Button
        title="Start Scan"
        onPress={() => {
          Alert.alert('Pressed');
          console.log('BUTTON PRESSED');
          BleAdvertiser.startAdvertising();
        }}
      />
      <Button
        title="Stop Scan"
        onPress={() => BleAdvertiser.stopAdvertising()}
      />
    </View>
  );
}

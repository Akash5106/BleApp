// ============================================================================
// USE BLE PERMISSIONS HOOK
// Location: src/hooks/useBlePermissions.ts
// Purpose: Handle Bluetooth permissions for Android and iOS
// ============================================================================

import { useState, useEffect } from 'react';
import {
  Platform,
  PermissionsAndroid,
  Alert,
  Linking,
  NativeEventEmitter,
  NativeModules,
} from 'react-native';
import BleManager from 'react-native-ble-manager';
import { ERROR_MESSAGES } from '../constants';
import { BLEPermissionsState } from '../types';

const bleManagerEmitter = new NativeEventEmitter(NativeModules.BleManager);

export const useBlePermissions = () => {
  const [state, setState] = useState<BLEPermissionsState>({
    granted: false,
    checking: true,
    bluetoothEnabled: false,
  });

  // -------------------------------------------------------------------------
  // Listen to Bluetooth state changes
  // -------------------------------------------------------------------------
  useEffect(() => {
    BleManager.start({ showAlert: false });
    const subscription = bleManagerEmitter.addListener(
      'BleManagerDidUpdateState',
      ({ state: bleState }) => {
        setState((prev: BLEPermissionsState) => ({
          ...prev,
          bluetoothEnabled: bleState === 'on',
          checking: false,
        }));
      }
    );

    checkPermissions();

    return () => {
      subscription.remove();
    };
  }, []);

  // -------------------------------------------------------------------------
  // Check permissions + Bluetooth state
  // -------------------------------------------------------------------------
  const checkPermissions = async () => {
    try {
      setState((prev: BLEPermissionsState) => ({
        ...prev,
        checking: true,
      }));

      if (Platform.OS === 'android') {
        const granted = await requestAndroidPermissions();
        await checkBluetoothState();

        setState((prev: BLEPermissionsState) => ({
          ...prev,
          granted,
        }));
      } else {
        // iOS: no runtime BLE permissions
        await checkBluetoothState();

        setState((prev: BLEPermissionsState) => ({
          ...prev,
          granted: true,
        }));
      }
    } catch (error) {
      console.error('❌ Permission check failed:', error);
      setState({
        granted: false,
        checking: false,
        bluetoothEnabled: false,
      });
    }
  };

  // -------------------------------------------------------------------------
  // Android permission handling
  // -------------------------------------------------------------------------
  const requestAndroidPermissions = async (): Promise<boolean> => {
    if (Platform.OS !== 'android') return true;

    try {
      const apiLevel = Platform.Version as number;

      if (apiLevel >= 31) {
        const permissions = [
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE,
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        ];

        const results = await PermissionsAndroid.requestMultiple(permissions);

        const allGranted = Object.values(results).every(
          status => status === PermissionsAndroid.RESULTS.GRANTED
        );

        if (!allGranted) {
          showPermissionDeniedAlert();
        }

        return allGranted;
      }

      if (apiLevel >= 23) {
        const permissions = [
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
        ];

        const results = await PermissionsAndroid.requestMultiple(permissions);

        const allGranted = Object.values(results).every(
          status => status === PermissionsAndroid.RESULTS.GRANTED
        );

        if (!allGranted) {
          showPermissionDeniedAlert();
        }

        return allGranted;
      }

      return true;
    } catch (error) {
      console.error('❌ Android permission request failed:', error);
      return false;
    }
  };

  // -------------------------------------------------------------------------
  // Bluetooth state check (event-driven)
  // -------------------------------------------------------------------------
  const checkBluetoothState = async (): Promise<boolean> => {
    try {
      await BleManager.checkState(); // triggers BleManagerDidUpdateState
      return true;
    } catch (error) {
      console.error('❌ Bluetooth state check failed:', error);
      return false;
    }
  };

  // -------------------------------------------------------------------------
  // Enable Bluetooth
  // -------------------------------------------------------------------------
  const enableBluetooth = async (): Promise<boolean> => {
    if (Platform.OS === 'android') {
      try {
        await BleManager.enableBluetooth();
        setState((prev: BLEPermissionsState) => ({
          ...prev,
          bluetoothEnabled: true,
        }));
        return true;
      } catch (error) {
        Alert.alert(
          ERROR_MESSAGES.ENABLE_BLUETOOTH_TITLE,
          ERROR_MESSAGES.ENABLE_BLUETOOTH_DESC,
          [{ text: 'OK' }]
        );
        return false;
      }
    }

    Alert.alert(
      ERROR_MESSAGES.ENABLE_BLUETOOTH_TITLE,
      ERROR_MESSAGES.ENABLE_BLUETOOTH_DESC,
      [{ text: 'OK' }]
    );
    return false;
  };

  // -------------------------------------------------------------------------
  // Permission denied alert
  // -------------------------------------------------------------------------
  const showPermissionDeniedAlert = () => {
    Alert.alert(
      ERROR_MESSAGES.PERMISSIONS_REQUIRED_TITLE,
      ERROR_MESSAGES.PERMISSIONS_REQUIRED_DESC,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Open Settings', onPress: () => Linking.openSettings() },
      ]
    );
  };

  // -------------------------------------------------------------------------
  // Derived ready flag (optional DX improvement)
  // -------------------------------------------------------------------------
  const ready =
    state.granted && state.bluetoothEnabled && !state.checking;

  // -------------------------------------------------------------------------
  // Exposed API
  // -------------------------------------------------------------------------
  return {
    ...state,
    ready,
    requestPermissions: checkPermissions,
    enableBluetooth,
    checkBluetoothState,
  };
};

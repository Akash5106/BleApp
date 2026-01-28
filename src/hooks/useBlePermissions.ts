// ============================================================================
// USE BLE PERMISSIONS HOOK
// Location: src/hooks/useBlePermissions.ts
// Purpose: Handle Bluetooth permissions for Android and iOS
// ============================================================================

import { useState, useEffect } from 'react';
import { Platform, PermissionsAndroid, Alert, Linking } from 'react-native';
import BleManager from 'react-native-ble-manager';

export interface BlePermissionsState {
  granted: boolean;
  checking: boolean;
  bluetoothEnabled: boolean;
}

export const useBlePermissions = () => {
  const [state, setState] = useState<BlePermissionsState>({
    granted: false,
    checking: true,
    bluetoothEnabled: false,
  });

  useEffect(() => {
    checkPermissions();
  }, []);

  /**
   * Check if permissions are granted
   */
  const checkPermissions = async () => {
    try {
      setState(prev => ({ ...prev, checking: true }));

      if (Platform.OS === 'android') {
        const granted = await requestAndroidPermissions();
        const enabled = await checkBluetoothState();
        
        setState({
          granted,
          checking: false,
          bluetoothEnabled: enabled,
        });
      } else {
        // iOS doesn't need runtime permissions for BLE
        const enabled = await checkBluetoothState();
        setState({
          granted: true,
          checking: false,
          bluetoothEnabled: enabled,
        });
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

  /**
   * Request Android permissions based on API level
   */
  const requestAndroidPermissions = async (): Promise<boolean> => {
    if (Platform.OS !== 'android') return true;

    try {
      const apiLevel = Platform.Version as number;

      if (apiLevel >= 31) {
        // Android 12+ (API 31+)
        const permissions = [
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE,
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        ];

        const granted = await PermissionsAndroid.requestMultiple(permissions);

        const allGranted = Object.values(granted).every(
          status => status === PermissionsAndroid.RESULTS.GRANTED
        );

        if (!allGranted) {
          showPermissionDeniedAlert();
        }

        return allGranted;
      } else if (apiLevel >= 23) {
        // Android 6-11 (API 23-30)
        const permissions = [
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
        ];

        const granted = await PermissionsAndroid.requestMultiple(permissions);

        const allGranted = Object.values(granted).every(
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

  /**
   * Check Bluetooth state
   */
  const checkBluetoothState = async (): Promise<boolean> => {
    try {
      const state = await BleManager.checkState();
      return state === 'on';
    } catch (error) {
      console.error('❌ Bluetooth state check failed:', error);
      return false;
    }
  };

  /**
   * Enable Bluetooth (Android only)
   */
  const enableBluetooth = async () => {
    if (Platform.OS === 'android') {
      try {
        await BleManager.enableBluetooth();
        setState(prev => ({ ...prev, bluetoothEnabled: true }));
        return true;
      } catch (error) {
        Alert.alert(
          'Enable Bluetooth',
          'Please enable Bluetooth in your device settings.',
          [{ text: 'OK' }]
        );
        return false;
      }
    } else {
      Alert.alert(
        'Enable Bluetooth',
        'Please enable Bluetooth in Settings > Bluetooth',
        [{ text: 'OK' }]
      );
      return false;
    }
  };

  /**
   * Show permission denied alert
   */
  const showPermissionDeniedAlert = () => {
    Alert.alert(
      'Permissions Required',
      'This app needs Bluetooth and Location permissions to discover nearby devices. Please grant permissions in Settings.',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Open Settings', 
          onPress: () => Linking.openSettings() 
        },
      ]
    );
  };

  /**
   * Request permissions again
   */
  const requestPermissions = async () => {
    await checkPermissions();
  };

  /**
   * Get required permissions list
   */
  const getRequiredPermissions = (): string[] => {
    if (Platform.OS === 'ios') {
      return [];
    }

    const apiLevel = Platform.Version as number;

    if (apiLevel >= 31) {
      return [
        'BLUETOOTH_SCAN',
        'BLUETOOTH_CONNECT',
        'BLUETOOTH_ADVERTISE',
        'ACCESS_FINE_LOCATION',
      ];
    } else if (apiLevel >= 23) {
      return [
        'ACCESS_FINE_LOCATION',
        'ACCESS_COARSE_LOCATION',
      ];
    }

    return [];
  };

  return {
    ...state,
    requestPermissions,
    enableBluetooth,
    checkBluetoothState,
    getRequiredPermissions,
  };
};
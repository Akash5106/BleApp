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
} from 'react-native';
import { State } from 'react-native-ble-plx';
import { ERROR_MESSAGES } from '../constants';
import { BLEPermissionsState } from '../types';
import { bleManager } from '../services/BLEService';

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
    let stateSubscription: any;

    const initializeBluetooth = async () => {
      try {
        console.log('[PERM] initializeBluetooth() called');
        // Subscribe to Bluetooth state changes
        stateSubscription = bleManager.onStateChange((bleState: State) => {
          console.log('[PERM] BLE state change event:', bleState);
          setState((prev: BLEPermissionsState) => ({
            ...prev,
            bluetoothEnabled: bleState === State.PoweredOn,
            checking: false,
          }));
        }, true); // true = emit current state immediately

        await checkPermissions();
      } catch (error) {
        console.error('[PERM] Bluetooth initialization failed:', error);
        setState({
          granted: false,
          checking: false,
          bluetoothEnabled: false,
        });
      }
    };

    initializeBluetooth();

    return () => {
      if (stateSubscription) {
        stateSubscription.remove();
      }
    };
  }, []);

  // -------------------------------------------------------------------------
  // Check permissions + Bluetooth state
  // -------------------------------------------------------------------------
  const checkPermissions = async () => {
    try {
      console.log('[PERM] checkPermissions() called');
      setState((prev: BLEPermissionsState) => ({
        ...prev,
        checking: true,
      }));

      let granted = true;
      if (Platform.OS === 'android') {
        granted = await requestAndroidPermissions();
      }

      const enabled = await checkBluetoothState();
      console.log('[PERM] checkPermissions result — granted:', granted, '| btEnabled:', enabled);

      // Both values set together — guarantees the useEffect in
      // NearbyPeersScreen sees granted && bluetoothEnabled at the same time.
      setState((prev: BLEPermissionsState) => ({
        ...prev,
        granted,
        bluetoothEnabled: enabled,
        checking: false,
      }));
    } catch (error) {
      console.error('[PERM] Permission check failed:', error);
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
      console.log('[PERM] requestAndroidPermissions() — API level:', apiLevel);

      if (apiLevel >= 31) {
        const permissions = [
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE,
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        ];

        const results = await PermissionsAndroid.requestMultiple(permissions);
        console.log('[PERM] API 31+ permission results:', JSON.stringify(results));

        const allGranted = Object.values(results).every(
          status => status === PermissionsAndroid.RESULTS.GRANTED
        );

        if (!allGranted) {
          console.log('[PERM] Some permissions denied (API 31+)');
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
        console.log('[PERM] API 23+ permission results:', JSON.stringify(results));

        const allGranted = Object.values(results).every(
          status => status === PermissionsAndroid.RESULTS.GRANTED
        );

        if (!allGranted) {
          console.log('[PERM] Some permissions denied (API 23+)');
          showPermissionDeniedAlert();
        }

        return allGranted;
      }

      return true;
    } catch (error) {
      console.error('[PERM] Android permission request failed:', error);
      return false;
    }
  };

  // -------------------------------------------------------------------------
  // Bluetooth state check (event-driven)
  // -------------------------------------------------------------------------
  const checkBluetoothState = async (): Promise<boolean> => {
    try {
      const bleState = await bleManager.state();
      const enabled = bleState === State.PoweredOn;
      console.log('[PERM] checkBluetoothState() — state:', bleState, '| enabled:', enabled);
      setState((prev: BLEPermissionsState) => ({
        ...prev,
        bluetoothEnabled: enabled,
        checking: false,
      }));
      return enabled;
    } catch (error) {
      console.error('[PERM] Bluetooth state check failed:', error);
      return false;
    }
  };

  // -------------------------------------------------------------------------
  // Enable Bluetooth
  // -------------------------------------------------------------------------
  const enableBluetooth = async (): Promise<boolean> => {
    console.log('[PERM] enableBluetooth() called');
    if (Platform.OS === 'android') {
      try {
        await bleManager.enable();
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
  console.log('[PERM] useBlePermissions state:', JSON.stringify({ granted: state.granted, bluetoothEnabled: state.bluetoothEnabled, checking: state.checking }));
  return {
    ...state,
    ready,
    requestPermissions: checkPermissions,
    enableBluetooth,
    checkBluetoothState,
  };
};
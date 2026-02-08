// ============================================================================
// MAIN APP COMPONENT
// Initializes services including broadcast queue and handles navigation
// ============================================================================

import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  PermissionsAndroid,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';

import { ChatScreen } from './src/screens/ChatScreen';
import { NearbyPeersScreen } from './src/screens/NearbyPeersScreen';
import { BroadcastScreen } from './src/screens/BroadcastScreen';

import DatabaseService from './src/database/DatabaseService';
import MeshProtocolService from './src/services/MeshProtocolService';
import BLEService from './src/services/BLEService';
import StorageService from './src/services/StorageService';
import BroadcastQueueService from './src/services/BroadcastQueueService';
import ChatQueueService from './src/services/ChatQueueService';

type Screen = 'peers' | 'chat' | 'broadcast';

interface ChatInfo {
  peerId: string;
  peerName: string;
}

const App: React.FC = () => {
  const [currentScreen, setCurrentScreen] = useState<Screen>('peers');
  const [chatInfo, setChatInfo] = useState<ChatInfo | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [deviceId, setDeviceId] = useState('');
  const [initError, setInitError] = useState('');
  const [queuedCount, setQueuedCount] = useState(0);

  const initializingRef = useRef(false);
  const mountedRef = useRef(true);
  const queueUnsubscribeRef = useRef<(() => void) | null>(null);

  // ============================================================================
  // LIFECYCLE
  // ============================================================================

  useEffect(() => {
    initializeApp();

    return () => {
      mountedRef.current = false;
      queueUnsubscribeRef.current?.();
      BLEService.stopPeriodicScanning();
      ChatQueueService.stopProcessing();
      BroadcastQueueService.stopProcessing();
    };
  }, []);

  // ============================================================================
  // PERMISSIONS
  // ============================================================================

  const requestAndroidPermissions = useCallback(
  async (): Promise<boolean> => {
    try {
      const apiLevel = Platform.Version as number;
      console.log('[APP] requestAndroidPermissions() — API level:', apiLevel);

      if (apiLevel >= 31) {
        const granted = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE,
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        ]);
        console.log('[APP] Permission results (API 31+):', JSON.stringify(granted));

        return Object.values(granted).every(
          v => v === PermissionsAndroid.RESULTS.GRANTED
        );
      } else {
        const granted = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
        ]);
        console.log('[APP] Permission results (API <31):', JSON.stringify(granted));

        return Object.values(granted).every(
          v => v === PermissionsAndroid.RESULTS.GRANTED
        );
      }
    } catch (e) {
      console.error('[APP] Permission request threw:', e);
      return false;
    }
  },
  []
);

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  const initializeApp = useCallback(async () => {
    if (initializingRef.current) return;
    initializingRef.current = true;

    try {
      console.log('[APP] ====== STARTING APP INITIALIZATION ======');

      // ---------------- Permissions ----------------
      if (Platform.OS === 'android') {
        console.log('[APP] [1/8] Requesting Android permissions...');
        const granted = await requestAndroidPermissions();
        console.log('[APP] [1/8] Permissions granted:', granted);
        if (!granted) {
          console.error('[APP] [1/8] PERMISSIONS DENIED — aborting init');
          setInitError('Permissions denied. Please grant all permissions.');
          return;
        }
      } else {
        console.log('[APP] [1/8] Skipping permissions (not Android)');
      }

      // ---------------- Database ----------------
      console.log('[APP] [2/8] Initializing DatabaseService...');
      await DatabaseService.init();
      console.log('[APP] [2/8] DatabaseService READY');

      // ---------------- Storage ----------------
      console.log('[APP] [3/8] Loading user settings...');
      const settings = await StorageService.initUserSettings();
      if (!mountedRef.current) {
        console.log('[APP] Component unmounted during init — aborting');
        return;
      }
      console.log('[APP] [3/8] Settings loaded — deviceId:', settings.device_id, '| username:', settings.username);
      setDeviceId(settings.device_id);

      // ---------------- BLE ----------------
      console.log('[APP] [4/8] Initializing BLEService...');
      await BLEService.init();
      console.log('[APP] [4/8] BLEService READY');

      // ---------------- Mesh ----------------
      // CRITICAL: MeshProtocolService identity MUST match the BLE advertising name.
      // Other devices discover us by advertising name, so packet src_id/dest_id
      // must use the same value for routing to work.
      const advertisingName = settings.username || `Mesh-${settings.device_id}`;
      console.log('[APP] [5/8] Initializing MeshProtocolService with advertisingName:', advertisingName);
      await MeshProtocolService.init(advertisingName);
      console.log('[APP] [5/8] MeshProtocolService READY');

      // ---------------- Advertising ----------------
      console.log('[APP] [5b] Starting BLE advertising...');
      await BLEService.startAdvertising(
        settings.device_id,
        advertisingName
      );
      console.log('[APP] [5b] BLE advertising STARTED');

      // ---------------- Broadcast Queue ----------------
      console.log('[APP] [6/8] Initializing BroadcastQueueService...');
      await BroadcastQueueService.init();
      console.log('[APP] [6/8] BroadcastQueueService READY');

      // ---------------- Chat Queue ----------------
      console.log('[APP] [7/8] Initializing ChatQueueService...');
      await ChatQueueService.init();
      console.log('[APP] [7/8] ChatQueueService READY');

      // ---------------- Periodic Scanning ----------------
      console.log('[APP] [8/8] Starting periodic BLE scanning...');
      BLEService.startPeriodicScanning();
      console.log('[APP] [8/8] Periodic scanning STARTED');

      // Remove old listener if retrying
      queueUnsubscribeRef.current?.();

      queueUnsubscribeRef.current =
        BroadcastQueueService.onQueueChange((count) => {
          if (mountedRef.current) {
            console.log('[APP] Queue count changed:', count);
            setQueuedCount(count);
          }
        });

      if (mountedRef.current) {
        setIsInitialized(true);
        console.log('[APP] ====== APP INITIALIZATION COMPLETE ======');
      }
    } catch (error) {
      console.error('[APP] ====== INITIALIZATION FAILED ======', error);
      if (mountedRef.current) {
        setInitError(
          error instanceof Error
            ? error.message
            : 'Initialization failed. Please restart.'
        );
        Alert.alert(
          'Initialization Error',
          'Failed to initialize the app. Please restart and ensure permissions are granted.'
        );
      }
    } finally {
      initializingRef.current = false;
    }
  }, []);

  // ============================================================================
  // NAVIGATION
  // ============================================================================

  const handleSelectPeer = (peerId: string, peerName?: string) => {
    console.log('[APP] Navigate to chat — peerId:', peerId, '| peerName:', peerName);
    setChatInfo({ peerId, peerName: peerName || peerId });
    setCurrentScreen('chat');
  };

  const handleBackFromChat = () => {
    console.log('[APP] Navigate back to peers');
    setChatInfo(null);
    setCurrentScreen('peers');
  };

  // ============================================================================
  // RENDER
  // ============================================================================

  const renderScreen = () => {
    if (initError) {
      return (
        <View style={styles.errorContainer}>
          <Text style={styles.errorIcon}>❌</Text>
          <Text style={styles.errorTitle}>Initialization Failed</Text>
          <Text style={styles.errorMessage}>{initError}</Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => {
              setInitError('');
              setIsInitialized(false);
              initializeApp();
            }}
          >
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (!isInitialized) {
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4A90E2" />
          <Text style={styles.loadingText}>Initializing Mesh Network…</Text>
          {deviceId !== '' && (
            <Text style={styles.deviceIdText}>Device ID: {deviceId}</Text>
          )}
        </View>
      );
    }

    switch (currentScreen) {
      case 'peers':
        return <NearbyPeersScreen onSelectPeer={handleSelectPeer} />;

      case 'chat':
        return chatInfo ? (
          <ChatScreen
            peerId={chatInfo.peerId}
            peerName={chatInfo.peerName}
            onBack={handleBackFromChat}
          />
        ) : null;

      case 'broadcast':
        return <BroadcastScreen />;

      default:
        return null;
    }
  };

  const renderNavBar = () => (
    <View style={styles.navbar}>
      <TouchableOpacity
        style={[styles.navItem, currentScreen === 'peers' && styles.navItemActive]}
        onPress={() => {
          setChatInfo(null);
          setCurrentScreen('peers');
        }}
      >
        <Text style={styles.navIcon}>👥</Text>
        <Text style={styles.navText}>Peers</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[
          styles.navItem,
          currentScreen === 'broadcast' && styles.navItemActive,
        ]}
        onPress={() => {
          setChatInfo(null);
          setCurrentScreen('broadcast');
        }}
      >
        <Text style={styles.navIcon}>📢</Text>
        <Text style={styles.navText}>Broadcast</Text>
        {queuedCount > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{queuedCount}</Text>
          </View>
        )}
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.container}>
      {renderScreen()}
      {isInitialized && !initError && renderNavBar()}
    </View>
  );
};

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },

  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  loadingText: {
    fontSize: 18,
    marginTop: 16,
  },

  deviceIdText: {
    fontSize: 12,
    color: '#666',
    marginTop: 8,
  },

  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  errorIcon: { fontSize: 64 },
  errorTitle: { fontSize: 20, color: '#FF5252' },
  errorMessage: { fontSize: 14, marginVertical: 12 },

  retryButton: {
    backgroundColor: '#4A90E2',
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 20,
  },

  retryButtonText: { color: '#fff' },

  navbar: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#ddd',
  },

  navItem: { flex: 1, alignItems: 'center', padding: 12 },
  navItemActive: { backgroundColor: '#eee' },
  navIcon: { fontSize: 22 },
  navText: { fontSize: 12 },

  badge: {
    position: 'absolute',
    top: 4,
    right: '30%',
    backgroundColor: '#FF5252',
    borderRadius: 10,
    paddingHorizontal: 6,
  },

  badgeText: { color: '#fff', fontSize: 11 },
});

export default App;
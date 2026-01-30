// ============================================================================
// MAIN APP COMPONENT
// Initializes services and handles navigation
// ============================================================================

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  PermissionsAndroid,
  Platform,
  Alert,
} from 'react-native';
import { ChatScreen } from './src/screens/ChatScreen';
import { NearbyPeersScreen } from './src/screens/NearbyPeersScreen';
import { BroadcastScreen } from './src/screens/BroadcastScreen';
import DatabaseService from './src/database/DatabaseService';
import MeshProtocolService from './src/services/MeshProtocolService.ts';
import BLEService from './src/services/BLEService';
import StorageService from './src/services/StorageService';

type Screen = 'peers' | 'chat' | 'broadcast';

interface ChatInfo {
  destId: string;
  destName: string;
}

const App: React.FC = () => {
  const [currentScreen, setCurrentScreen] = useState<Screen>('peers');
  const [chatInfo, setChatInfo] = useState<ChatInfo | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [deviceId, setDeviceId] = useState('');

  useEffect(() => {
    initializeApp();
  }, []);

  /**
   * Initialize all services
   */
  const initializeApp = async () => {
    try {
      // Request permissions (Android)
      if (Platform.OS === 'android') {
        await requestAndroidPermissions();
      }

      // Initialize database
      await DatabaseService.init();

      // Initialize storage and get device ID
      const settings = await StorageService.initUserSettings();
      setDeviceId(settings.device_id);

      // Initialize BLE service
      await BLEService.init();

      // Initialize mesh protocol
      await MeshProtocolService.init(settings.device_id);

      setIsInitialized(true);
      console.log('✅ App initialized successfully');
    } catch (error) {
      console.error('❌ App initialization failed:', error);
      Alert.alert('Error', 'Failed to initialize app. Please restart.');
    }
  };

  /**
   * Request Android permissions
   */
  const requestAndroidPermissions = async () => {
    if (Platform.OS !== 'android') return;

    try {
      const apiLevel = Platform.Version;

      if (apiLevel >= 31) {
        // Android 12+ (API 31+)
        const granted = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE,
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        ]);

        const allGranted = Object.values(granted).every(
          status => status === PermissionsAndroid.RESULTS.GRANTED
        );

        if (!allGranted) {
          Alert.alert(
            'Permissions Required',
            'This app needs Bluetooth and Location permissions to work.'
          );
        }
      } else {
        // Android 11 and below
        const granted = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
        ]);

        const allGranted = Object.values(granted).every(
          status => status === PermissionsAndroid.RESULTS.GRANTED
        );

        if (!allGranted) {
          Alert.alert(
            'Permissions Required',
            'This app needs Location permissions to scan for Bluetooth devices.'
          );
        }
      }
    } catch (error) {
      console.error('❌ Permission request failed:', error);
    }
  };

  /**
   * Handle peer selection
   */
  const handleSelectPeer = (peerId: string, peerName: string) => {
    setChatInfo({ destId: peerId, destName: peerName });
    setCurrentScreen('chat');
  };

  /**
   * Render navigation bar
   */
  const renderNavBar = () => (
    <View style={styles.navbar}>
      <TouchableOpacity
        style={[styles.navItem, currentScreen === 'peers' && styles.navItemActive]}
        onPress={() => setCurrentScreen('peers')}
      >
        <Text style={styles.navIcon}>👥</Text>
        <Text style={styles.navText}>Peers</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.navItem, currentScreen === 'broadcast' && styles.navItemActive]}
        onPress={() => setCurrentScreen('broadcast')}
      >
        <Text style={styles.navIcon}>📢</Text>
        <Text style={styles.navText}>Broadcast</Text>
      </TouchableOpacity>
    </View>
  );

  /**
   * Render current screen
   */
  const renderScreen = () => {
    if (!isInitialized) {
      return (
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>🔄 Initializing...</Text>
          <Text style={styles.deviceIdText}>Device ID: {deviceId || 'Generating...'}</Text>
        </View>
      );
    }

    switch (currentScreen) {
      case 'peers':
        return (
        <NearbyPeersScreen 
        onSelectPeer={handleSelectPeer} 
        navigation={{ navigate: () => setCurrentScreen('chat') }} // Pass a mock object
        />
      );
      case 'chat':
        return chatInfo ? (
        <ChatScreen 
        peerId={chatInfo.destId} 
        destName={chatInfo.destName} 
        navigation={{ goBack: () => setCurrentScreen('peers') }} // Pass mock goBack
        />
      ) : null;
    }
  };

  return (
    <View style={styles.container}>
      {renderScreen()}
      {isInitialized && renderNavBar()}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  loadingText: {
    fontSize: 24,
    fontWeight: '600',
    color: '#333',
    marginBottom: 16,
  },
  deviceIdText: {
    fontSize: 14,
    color: '#666',
  },
  navbar: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    paddingBottom: Platform.OS === 'ios' ? 20 : 0,
  },
  navItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
  },
  navItemActive: {
    backgroundColor: '#f0f0f0',
  },
  navIcon: {
    fontSize: 24,
    marginBottom: 4,
  },
  navText: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
  },
});

export default App;

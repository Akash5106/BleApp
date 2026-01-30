// ============================================================================
// MAIN APP COMPONENT - DEBUGGED & ENHANCED
// Initializes services including broadcast queue and handles navigation
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

  useEffect(() => {
    initializeApp();
  }, []);

  /**
   * Initialize all services in correct order
   */
  // ============================================================================
// FIXED INITIALIZATION CODE FOR APP.TSX
// Replace your initializeApp function with this
// ============================================================================

const initializeApp = async () => {
  try {
    console.log('🚀 Starting app initialization...');

    // Step 1: Request permissions (Android)
    if (Platform.OS === 'android') {
      const permissionsGranted = await requestAndroidPermissions();
      if (!permissionsGranted) {
        setInitError('Permissions denied. Please grant all permissions.');
        return;
      }
    }

    // Step 2: Initialize database
    console.log('📦 Initializing database...');
    await DatabaseService.init();
    console.log('✅ Database initialized');

    // Step 3: Initialize storage and get device ID
    console.log('💾 Initializing storage...');
    const settings = await StorageService.initUserSettings();
    setDeviceId(settings.device_id);
    console.log('✅ Storage initialized, Device ID:', settings.device_id);

    // Step 4: Initialize BLE service
    console.log('📡 Initializing BLE service...');
    await BLEService.init();
    console.log('✅ BLE service initialized');

    // Step 5: Initialize mesh protocol
    console.log('🌐 Initializing mesh protocol...');
    await MeshProtocolService.init(settings.device_id);
    console.log('✅ Mesh protocol initialized');

    // Step 6: Start BLE advertising (FIXED - moved after MeshProtocol init)
    console.log('📡 Starting BLE advertising...');
    await BLEService.startAdvertising(
      settings.device_id,  // ⭐ FIXED: Added comma
      settings.username || `Mesh-${settings.device_id}`  // ⭐ FIXED: Added backticks for template literal
    );
    console.log('✅ BLE advertising started');

    // Step 7: Initialize broadcast queue service
    console.log('📥 Initializing broadcast queue...');
    await BroadcastQueueService.init();
    
    // Subscribe to queue changes
    BroadcastQueueService.onQueueChange((count) => {
      setQueuedCount(count);
      console.log('📊 Queue updated:', count, 'messages');
    });
    console.log('✅ Broadcast queue initialized');

    // ⭐ FIXED: Set initialized only once at the end
    setIsInitialized(true);
    console.log('🎉 App initialization complete!');

  } catch (error) {
    console.error('❌ App initialization failed:', error);
    setInitError(
      error instanceof Error 
        ? error.message 
        : 'Failed to initialize app. Please restart.'
    );
    
    Alert.alert(
      'Initialization Error',
      'Failed to initialize the app. Please restart and ensure all permissions are granted.',
      [{ text: 'OK' }]
    );
  }
};

  /**
   * Request Android permissions based on API level
   */
  const requestAndroidPermissions = async (): Promise<boolean> => {
    if (Platform.OS !== 'android') return true;

    try {
      const apiLevel = Platform.Version as number;
      console.log('📱 Android API Level:', apiLevel);

      if (apiLevel >= 31) {
        // Android 12+ (API 31+)
        console.log('🔐 Requesting Android 12+ permissions...');
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
          console.log('⚠️ Some permissions denied:', granted);
          Alert.alert(
            'Permissions Required',
            'This app needs Bluetooth and Location permissions to discover and communicate with nearby devices.',
            [{ text: 'OK' }]
          );
        }

        return allGranted;
      } else {
        // Android 6-11 (API 23-30)
        console.log('🔐 Requesting Android 6-11 permissions...');
        const granted = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
        ]);

        const allGranted = Object.values(granted).every(
          status => status === PermissionsAndroid.RESULTS.GRANTED
        );

        if (!allGranted) {
          console.log('⚠️ Location permissions denied');
          Alert.alert(
            'Permissions Required',
            'This app needs Location permissions to scan for Bluetooth devices.',
            [{ text: 'OK' }]
          );
        }

        return allGranted;
      }
    } catch (error) {
      console.error('❌ Permission request failed:', error);
      return false;
    }
  };

  /**
   * Handle peer selection from NearbyPeersScreen
   */
  const handleSelectPeer = (peerId: string, peerName?: string) => {
    console.log('👤 Selected peer:', peerId, peerName);
    setChatInfo({ 
      peerId, 
      peerName: peerName || peerId 
    });
    setCurrentScreen('chat');
  };

  /**
   * Handle back navigation from chat
   */
  const handleBackFromChat = () => {
    console.log('⬅️ Back from chat');
    setChatInfo(null);
    setCurrentScreen('peers');
  };

  /**
   * Render navigation bar
   */
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
        style={[styles.navItem, currentScreen === 'broadcast' && styles.navItemActive]}
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

  /**
   * Render current screen
   */
  const renderScreen = () => {
    // Show error state
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

    // Show loading state
    if (!isInitialized) {
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4A90E2" />
          <Text style={styles.loadingText}>Initializing Mesh Network...</Text>
          {deviceId && (
            <Text style={styles.deviceIdText}>Device ID: {deviceId}</Text>
          )}
          <View style={styles.stepsContainer}>
            <Text style={styles.stepText}>• Initializing database</Text>
            <Text style={styles.stepText}>• Setting up Bluetooth</Text>
            <Text style={styles.stepText}>• Starting mesh protocol</Text>
            <Text style={styles.stepText}>• Preparing broadcast queue</Text>
          </View>
        </View>
      );
    }

    // Render active screen
    switch (currentScreen) {
      case 'peers':
        return (
          <NearbyPeersScreen onSelectPeer={handleSelectPeer} />

        );

      case 'chat':
  return chatInfo ? (
    <ChatScreen
      peerId={chatInfo.peerId}
      peerName={chatInfo.peerName}
      onBack={handleBackFromChat}
    />
  ) : (
    <View style={styles.errorContainer}>
      <Text style={styles.errorMessage}>No chat selected</Text>
      <TouchableOpacity 
        style={styles.retryButton}
        onPress={() => setCurrentScreen('peers')}
      >
        <Text style={styles.retryButtonText}>Go to Peers</Text>
      </TouchableOpacity>
    </View>
  );


      case 'broadcast':
        return <BroadcastScreen />;

      default:
        return null;
    }
  };

  return (
    <View style={styles.container}>
      {renderScreen()}
      {isInitialized && !initError && renderNavBar()}
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
    padding: 20,
  },
  loadingText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    marginTop: 16,
    marginBottom: 8,
  },
  deviceIdText: {
    fontSize: 14,
    color: '#666',
    marginTop: 8,
  },
  stepsContainer: {
    marginTop: 24,
    alignItems: 'flex-start',
  },
  stepText: {
    fontSize: 13,
    color: '#999',
    marginVertical: 4,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    padding: 32,
  },
  errorIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#FF5252',
    marginBottom: 8,
  },
  errorMessage: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  retryButton: {
    backgroundColor: '#4A90E2',
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 24,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  navbar: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    paddingBottom: Platform.OS === 'ios' ? 20 : 0,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  navItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    position: 'relative',
  },
  navItemActive: {
    backgroundColor: '#f0f0f0',
    borderTopWidth: 2,
    borderTopColor: '#4A90E2',
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
  badge: {
    position: 'absolute',
    top: 6,
    right: '30%',
    backgroundColor: '#FF5252',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  badgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: 'bold',
  },
});

export default App;
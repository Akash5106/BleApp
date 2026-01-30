// ============================================================================
// NEARBY PEERS SCREEN
// Location: src/screens/NearbyPeersScreen.tsx
// Purpose: Discover and connect to nearby mesh devices
// ============================================================================

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  RefreshControl,
  SafeAreaView,
  TouchableOpacity,
} from 'react-native';
import { PeerCard } from '../components/PeerCard';
import { EmptyState } from '../components/EmptyState';
import { Loading } from '../components/Loading';
import { useMeshProtocol } from '../hooks/useMeshProtocol';
import { useBlePermissions } from '../hooks/useBlePermissions';
import BLEService from '../services/BLEService';
import { COLORS } from '../constant';

interface NearbyPeersScreenProps {
  onSelectPeer: (peerId: string, peerName: string)=>void;
  navigation: any;
}

export const NearbyPeersScreen: React.FC<NearbyPeersScreenProps> = ({ navigation,onSelectPeer }) => {
  const { neighbors, getActiveNeighbors } = useMeshProtocol();
  const { granted, bluetoothEnabled, requestPermissions, enableBluetooth } = useBlePermissions();
  
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isScanning, setIsScanning] = useState(false);

  useEffect(() => {
    if (granted && bluetoothEnabled) {
      startScanning();
    }
  }, [granted, bluetoothEnabled]);

  const startScanning = async () => {
    try {
      setIsScanning(true);
      await BLEService.startScan();
      setTimeout(() => {
        setIsScanning(false);
      }, 5000);
    } catch (error) {
      console.error('❌ Failed to start scanning:', error);
      setIsScanning(false);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await startScanning();
    setIsRefreshing(false);
  };

  const handlePeerPress = (peerId: string, peerName?: string) => {
    onSelectPeer(peerId, peerName || peerId);
    navigation.navigate('Chat', {
      peerId,
      peerName: peerName || peerId,
    });
  };

  const handleEnableBluetooth = async () => {
    await enableBluetooth();
  };

  const handleRequestPermissions = async () => {
    await requestPermissions();
  };

  if (!granted) {
  return (
    <SafeAreaView style={styles.container}>
      <EmptyState
        icon="🔐"
        title="Permissions Required"
        description="This app needs Bluetooth and Location permissions to discover nearby devices."
        action={
          <TouchableOpacity
            style={styles.actionButton}
            onPress={handleRequestPermissions}
          >
            <Text style={styles.actionButtonText}>Grant Permissions</Text>
          </TouchableOpacity>
        }
      />
    </SafeAreaView>
  );
}

if (!bluetoothEnabled) {
  return (
    <SafeAreaView style={styles.container}>
      <EmptyState
        icon="📡"
        title="Bluetooth is Off"
        description="Please enable Bluetooth to discover nearby devices."
        action={
          <TouchableOpacity
            style={styles.actionButton}
            onPress={handleEnableBluetooth}
          >
            <Text style={styles.actionButtonText}>Enable Bluetooth</Text>
          </TouchableOpacity>
        }
      />
    </SafeAreaView>
  );
}


  const renderHeader = () => (
    <View style={styles.header}>
      <View style={styles.headerTop}>
        <Text style={styles.headerTitle}>Nearby Devices</Text>
        {isScanning && <Text style={styles.scanningText}>🔍 Scanning...</Text>}
      </View>
      <Text style={styles.headerSubtitle}>
        {neighbors.length} device{neighbors.length !== 1 ? 's' : ''} found
      </Text>
    </View>
  );

  const renderPeer = ({ item }: { item: any }) => (
    <PeerCard
      deviceId={item.deviceId}
      deviceName={item.deviceName}
      lastSeen={item.lastSeen}
      rssi={item.rssi}
      isActive={item.isActive}
      onPress={() => handlePeerPress(item.deviceId, item.deviceName)}
    />
  );

  return (
    <SafeAreaView style={styles.container}>
      {renderHeader()}
      
      {neighbors.length === 0 && !isScanning ? (
        <EmptyState
          icon="🔍"
          title="No Devices Found"
          description="Make sure other devices are nearby with the app open and Bluetooth enabled."
          action={
            <TouchableOpacity style={styles.actionButton} onPress={handleRefresh}>
              <Text style={styles.actionButtonText}>Scan Again</Text>
            </TouchableOpacity>
          }
        />
      ) : (
        <FlatList
          data={neighbors}
          renderItem={renderPeer}
          keyExtractor={(item) => item.deviceId}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              tintColor={COLORS.primary}
            />
          }
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    backgroundColor: COLORS.primary,
    padding: 16,
    paddingTop: 8,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.surface,
  },
  scanningText: {
    fontSize: 14,
    color: COLORS.surface,
  },
  headerSubtitle: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.8)',
  },
  listContent: {
    padding: 16,
  },
  actionButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
    marginTop: 16,
  },
  actionButtonText: {
    color: COLORS.surface,
    fontSize: 16,
    fontWeight: '600',
  },
});

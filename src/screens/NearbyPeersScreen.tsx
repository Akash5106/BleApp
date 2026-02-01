// ============================================================================
// NEARBY PEERS SCREEN
// Location: src/screens/NearbyPeersScreen.tsx
// Purpose: Discover and connect to nearby mesh devices (FINAL, SAFE)
// ============================================================================

import React, { useState, useEffect, useRef } from 'react';
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

import { useMeshProtocol } from '../hooks/useMeshProtocol';
import { useBlePermissions } from '../hooks/useBlePermissions';
import BLEService from '../services/BLEService';
import { COLORS } from '../constants';

interface NearbyPeersScreenProps {
  onSelectPeer: (peerId: string, peerName: string) => void;
}

export const NearbyPeersScreen: React.FC<NearbyPeersScreenProps> = ({
  onSelectPeer,
}) => {
  const { getActiveNeighbors } = useMeshProtocol();
  const {
    granted,
    bluetoothEnabled,
    requestPermissions,
    enableBluetooth,
  } = useBlePermissions();

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isScanning, setIsScanning] = useState(false);

  const scanTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scanningRef = useRef(false);

  const activeNeighbors = getActiveNeighbors();

  // =========================================================================
  // AUTO SCAN WHEN READY
  // =========================================================================
  useEffect(() => {
    if (granted && bluetoothEnabled) {
      startScanning();
    }

    return () => {
      if (scanTimeoutRef.current) {
        clearTimeout(scanTimeoutRef.current);
      }
    };
  }, [granted, bluetoothEnabled]);

  // =========================================================================
  // START SCANNING (GUARDED)
  // =========================================================================
  const startScanning = async () => {
    if (scanningRef.current) return;

    try {
      scanningRef.current = true;
      setIsScanning(true);

      await BLEService.startScan();

      scanTimeoutRef.current = setTimeout(() => {
        scanningRef.current = false;
        setIsScanning(false);
      }, 5000);
    } catch (error) {
      console.error('❌ Failed to start scanning:', error);
      scanningRef.current = false;
      setIsScanning(false);
    }
  };

  // =========================================================================
  // REFRESH
  // =========================================================================
  const handleRefresh = async () => {
    if (isScanning) return;

    setIsRefreshing(true);
    await startScanning();
    setIsRefreshing(false);
  };

  // =========================================================================
  // PEER SELECT (ID-ONLY, SAFE)
  // =========================================================================
  const handlePeerPress = (peerId: string) => {
    // peerName is not implemented anywhere → use peerId
    onSelectPeer(peerId, peerId);
  };

  // =========================================================================
  // PERMISSION GATE
  // =========================================================================
  if (!granted) {
    return (
      <SafeAreaView style={styles.container}>
        <EmptyState
          icon="🔐"
          title="Permissions Required"
          description="Bluetooth and Location permissions are required."
          action={
            <TouchableOpacity
              style={styles.actionButton}
              onPress={requestPermissions}
            >
              <Text style={styles.actionButtonText}>
                Grant Permissions
              </Text>
            </TouchableOpacity>
          }
        />
      </SafeAreaView>
    );
  }

  // =========================================================================
  // BLUETOOTH GATE
  // =========================================================================
  if (!bluetoothEnabled) {
    return (
      <SafeAreaView style={styles.container}>
        <EmptyState
          icon="📡"
          title="Bluetooth is Off"
          description="Enable Bluetooth to discover nearby devices."
          action={
            <TouchableOpacity
              style={styles.actionButton}
              onPress={enableBluetooth}
            >
              <Text style={styles.actionButtonText}>
                Enable Bluetooth
              </Text>
            </TouchableOpacity>
          }
        />
      </SafeAreaView>
    );
  }

  // =========================================================================
  // RENDER
  // =========================================================================
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Text style={styles.headerTitle}>Nearby Devices</Text>
          {isScanning && (
            <Text style={styles.scanningText}>🔍 Scanning...</Text>
          )}
        </View>
        <Text style={styles.headerSubtitle}>
          {activeNeighbors.length} device
          {activeNeighbors.length !== 1 ? 's' : ''} online
        </Text>
      </View>

      {activeNeighbors.length === 0 && !isScanning ? (
        <EmptyState
          icon="🔍"
          title="No Devices Found"
          description="Ensure nearby devices have the app open."
          action={
            <TouchableOpacity
              style={styles.actionButton}
              onPress={handleRefresh}
            >
              <Text style={styles.actionButtonText}>
                Scan Again
              </Text>
            </TouchableOpacity>
          }
        />
      ) : (
        <FlatList
          data={activeNeighbors}
          keyExtractor={item => item.deviceId}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              tintColor={COLORS.primary}
            />
          }
          renderItem={({ item }) => (
            <PeerCard
              deviceId={item.deviceId}
              deviceName={item.deviceId}
              lastSeen={item.lastSeen}
              rssi={item.rssi}
              isActive={item.isActive}
              onPress={() => handlePeerPress(item.deviceId)}
            />
          )}
        />
      )}
    </SafeAreaView>
  );
};

// ============================================================================
// STYLES
// ============================================================================
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
    color: 'rgba(255,255,255,0.8)',
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
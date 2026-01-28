// ============================================================================
// PEER CARD COMPONENT
// Location: src/components/PeerCard.tsx
// Purpose: Display discovered peer devices in the mesh network
// ============================================================================

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

interface PeerCardProps {
  deviceId: string;
  deviceName?: string;
  lastSeen: number;
  rssi?: number;
  isActive: boolean;
  onPress: () => void;
}

export const PeerCard: React.FC<PeerCardProps> = ({
  deviceId,
  deviceName,
  lastSeen,
  rssi,
  isActive,
  onPress,
}) => {
  const formatLastSeen = (timestamp: number): string => {
    const secondsAgo = Math.floor((Date.now() - timestamp) / 1000);
    
    if (secondsAgo < 5) {
      return 'Active now';
    }
    
    if (secondsAgo < 60) {
      return `${secondsAgo}s ago`;
    }
    
    const minutesAgo = Math.floor(secondsAgo / 60);
    if (minutesAgo < 60) {
      return `${minutesAgo}m ago`;
    }
    
    const hoursAgo = Math.floor(minutesAgo / 60);
    return `${hoursAgo}h ago`;
  };

  const getSignalStrength = (rssi?: number): string => {
    if (!rssi) return '📶';
    if (rssi >= -60) return '📶 Strong';
    if (rssi >= -70) return '📶 Good';
    if (rssi >= -80) return '📶 Fair';
    return '📶 Weak';
  };

  return (
    <TouchableOpacity 
      style={styles.container} 
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.content}>
        <View style={[
          styles.statusDot,
          isActive ? styles.statusActive : styles.statusInactive
        ]} />
        
        <View style={styles.infoContainer}>
          <Text style={styles.deviceId}>
            {deviceName || deviceId}
          </Text>
          {deviceName && (
            <Text style={styles.deviceIdSmall}>{deviceId}</Text>
          )}
          <Text style={styles.lastSeen}>
            {formatLastSeen(lastSeen)}
          </Text>
        </View>

        {rssi !== undefined && (
          <View style={styles.signalContainer}>
            <Text style={styles.signalText}>{getSignalStrength(rssi)}</Text>
            <Text style={styles.rssiValue}>{rssi} dBm</Text>
          </View>
        )}
      </View>
      
      <Text style={styles.arrow}>›</Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    marginHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 12,
  },
  statusActive: {
    backgroundColor: '#4CAF50',
  },
  statusInactive: {
    backgroundColor: '#999999',
  },
  infoContainer: {
    flex: 1,
  },
  deviceId: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333333',
    marginBottom: 2,
  },
  deviceIdSmall: {
    fontSize: 12,
    color: '#666666',
    marginBottom: 2,
  },
  lastSeen: {
    fontSize: 13,
    color: '#666666',
  },
  signalContainer: {
    alignItems: 'flex-end',
    marginLeft: 8,
  },
  signalText: {
    fontSize: 14,
    color: '#666666',
  },
  rssiValue: {
    fontSize: 11,
    color: '#999999',
    marginTop: 2,
  },
  arrow: {
    fontSize: 28,
    color: '#999999',
    marginLeft: 8,
  },
});

export default PeerCard;

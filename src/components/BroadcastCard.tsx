// ============================================================================
// BROADCAST CARD COMPONENT
// Location: src/components/BroadcastCard.tsx
// Purpose: Display broadcast messages with emergency highlighting
// ============================================================================

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS } from '../constants';

interface BroadcastCardProps {
  message: string;
  senderId: string;
  timestamp: number;
  isEmergency: boolean;
}

export const BroadcastCard: React.FC<BroadcastCardProps> = ({
  message,
  senderId,
  timestamp,
  isEmergency,
}) => {
  const displaySender =senderId.length > 8 ? senderId.slice(0, 8) + '…' : senderId;
  const formatTimestamp = React.useCallback(
    (timestamp: number): string => {
    const date = new Date(timestamp);
    const now = new Date();
    
    const isToday = date.toDateString() === now.toDateString();
    
    if (isToday) {
      return date.toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit' 
      });
    }
    
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  },
  []
  );

  return (
    <View
      style={[styles.container, isEmergency && styles.emergencyContainer]}
      accessibilityLabel={isEmergency ? 'Emergency broadcast message' : 'Broadcast message'}
    >

      <View style={styles.header}>
        <Text style={styles.senderId}>{displaySender}</Text>
        {isEmergency && (
          <View style={styles.emergencyBadge}>
            <Text style={styles.emergencyText}>🚨 EMERGENCY</Text>
          </View>
        )}
      </View>

      <Text style={[
        styles.message,
        isEmergency && styles.emergencyMessage
      ]}>
        {message}
      </Text>

      <Text style={styles.timestamp}>
        {formatTimestamp(timestamp)}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    marginHorizontal: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },

  emergencyContainer: {
    borderWidth: 2,
    borderColor: COLORS.danger,
    backgroundColor: '#FFF5F5',
  },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },

  senderId: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.primary,
  },

  emergencyBadge: {
    backgroundColor: COLORS.danger,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },

  emergencyText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: COLORS.surface,
  },

  message: {
    fontSize: 16,
    color: COLORS.text,
    lineHeight: 22,
    marginBottom: 8,
  },

  emergencyMessage: {
    fontWeight: '500',
    color: '#000000',
  },

  timestamp: {
    fontSize: 12,
    color: COLORS.textLighter,
  },
});

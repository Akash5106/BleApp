// ============================================================================
// BROADCAST SCREEN - WITH QUEUE SYSTEM
// Location: src/screens/BroadcastScreen.tsx
// Purpose: Send and view broadcast messages with offline queue (like Bridgefy)
// ============================================================================

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Switch,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { BroadcastCard } from '../components/BroadcastCard';
import { EmptyState } from '../components/EmptyState';
import { Loading } from '../components/Loading';
import { useMeshProtocol } from '../hooks/useMeshProtocol';
import DatabaseService from '../database/DatabaseService';
import BroadcastQueueService from '../services/BroadcastQueueService';
import { StoredMessage, MessageFlags } from '../types';
import { COLORS } from '../constant';

export const BroadcastScreen: React.FC = () => {
  const { sendBroadcast, neighbors } = useMeshProtocol();
  
  const [broadcasts, setBroadcasts] = useState<StoredMessage[]>([]);
  const [queuedCount, setQueuedCount] = useState(0);
  const [inputText, setInputText] = useState('');
  const [isEmergency, setIsEmergency] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    loadBroadcasts();
    loadQueuedCount();
    
    // Subscribe to queue updates
    const unsubscribe = BroadcastQueueService.onQueueChange((count) => {
      setQueuedCount(count);
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    // When neighbors change, try to flush queue
    if (neighbors.length > 0) {
      BroadcastQueueService.processQueue();
    }
  }, [neighbors]);

  const loadBroadcasts = async () => {
    try {
      setLoading(true);
      const msgs = await DatabaseService.getBroadcastMessages();
      setBroadcasts(msgs);
    } catch (error) {
      console.error('❌ Failed to load broadcasts:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadQueuedCount = async () => {
    const count = await BroadcastQueueService.getQueueSize();
    setQueuedCount(count);
  };

  const handleSend = async () => {
    if (!inputText.trim() || sending) return;

    const messageText = inputText.trim();
    setInputText('');
    setSending(true);

    try {
      // Check if there are neighbors
      const hasNeighbors = neighbors.length > 0;

      if (hasNeighbors) {
        // Send immediately if neighbors are available
        await sendBroadcast(messageText, isEmergency);
        console.log('✅ Broadcast sent immediately');
      } else {
        // Queue for later if no neighbors
        await BroadcastQueueService.queueBroadcast(messageText, isEmergency);
        console.log('📦 Broadcast queued for later delivery');
        await loadQueuedCount();
      }

      setIsEmergency(false);
      await loadBroadcasts();
    } catch (error) {
      console.error('❌ Failed to send broadcast:', error);
      setInputText(messageText); // Restore text on error
    } finally {
      setSending(false);
    }
  };

  const renderBroadcast = ({ item }: { item: StoredMessage }) => {
    const isEmergencyMsg = (item.flags & MessageFlags.EMERGENCY) !== 0;

    return (
      <BroadcastCard
        message={item.payload}
        senderId={item.src_id}
        timestamp={item.timestamp}
        isEmergency={isEmergencyMsg}
      />
    );
  };

  if (loading) {
    return <Loading message="Loading broadcasts..." />;
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={90}
      >
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Broadcast</Text>
          <Text style={styles.headerSubtitle}>
            Send messages to all nearby devices
          </Text>
        </View>

        {/* Network Status Indicator */}
        <View style={[
          styles.statusBar,
          neighbors.length > 0 ? styles.statusOnline : styles.statusOffline
        ]}>
          <View style={styles.statusLeft}>
            <View style={[
              styles.statusDot,
              neighbors.length > 0 ? styles.dotOnline : styles.dotOffline
            ]} />
            <Text style={styles.statusText}>
              {neighbors.length > 0 
                ? `${neighbors.length} device${neighbors.length !== 1 ? 's' : ''} online`
                : 'No devices nearby'
              }
            </Text>
          </View>
          
          {queuedCount > 0 && (
            <View style={styles.queueBadge}>
              <Text style={styles.queueBadgeText}>
                📦 {queuedCount} queued
              </Text>
            </View>
          )}
        </View>

        <View style={styles.composeContainer}>
          <TextInput
            style={[
              styles.input,
              isEmergency && styles.inputEmergency,
            ]}
            value={inputText}
            onChangeText={setInputText}
            placeholder={isEmergency ? "Emergency message..." : "Broadcast a message..."}
            placeholderTextColor={COLORS.textLighter}
            multiline
            maxLength={500}
            editable={!sending}
          />
          
          <View style={styles.optionsRow}>
            <View style={styles.emergencyToggle}>
              <Text style={styles.emergencyLabel}>🚨 Emergency</Text>
              <Switch
                value={isEmergency}
                onValueChange={setIsEmergency}
                trackColor={{ false: COLORS.textLighter, true: COLORS.danger }}
                thumbColor={isEmergency ? COLORS.surface : '#f4f3f4'}
              />
            </View>

            <TouchableOpacity
              style={[
                styles.sendButton,
                (!inputText.trim() || sending) && styles.sendButtonDisabled,
                isEmergency && styles.emergencySendButton,
              ]}
              onPress={handleSend}
              disabled={!inputText.trim() || sending}
            >
              <Text style={styles.sendButtonText}>
                {sending 
                  ? '⏳ Sending...' 
                  : neighbors.length > 0 
                    ? (isEmergency ? '🚨 Send Emergency' : '📢 Broadcast')
                    : (isEmergency ? '📦 Queue Emergency' : '📦 Queue Message')
                }
              </Text>
            </TouchableOpacity>
          </View>

          {/* Queue Info Message */}
          {neighbors.length === 0 && (
            <View style={styles.queueInfo}>
              <Text style={styles.queueInfoText}>
                💡 No devices nearby. Message will be queued and sent automatically when peers come in range.
              </Text>
            </View>
          )}
        </View>

        <View style={styles.listHeader}>
          <Text style={styles.listHeaderText}>Recent Broadcasts</Text>
          <Text style={styles.listHeaderCount}>
            {broadcasts.length} message{broadcasts.length !== 1 ? 's' : ''}
          </Text>
        </View>

        {broadcasts.length === 0 ? (
          <EmptyState
            icon="📢"
            title="No broadcasts yet"
            description="Send a message to all devices in the mesh network"
          />
        ) : (
          <FlatList
            data={broadcasts}
            renderItem={renderBroadcast}
            keyExtractor={(item) => item.msg_id}
            contentContainerStyle={styles.listContent}
          />
        )}
      </KeyboardAvoidingView>
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
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.surface,
  },
  headerSubtitle: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.8)',
    marginTop: 4,
  },
  statusBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
  },
  statusOnline: {
    backgroundColor: '#E8F5E9',
    borderBottomColor: '#4CAF50',
  },
  statusOffline: {
    backgroundColor: '#FFF3E0',
    borderBottomColor: '#FF9800',
  },
  statusLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  dotOnline: {
    backgroundColor: '#4CAF50',
  },
  dotOffline: {
    backgroundColor: '#FF9800',
  },
  statusText: {
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.text,
  },
  queueBadge: {
    backgroundColor: COLORS.warning,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  queueBadgeText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: COLORS.surface,
  },
  composeContainer: {
    backgroundColor: COLORS.surface,
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  input: {
    backgroundColor: COLORS.background,
    borderRadius: 12,
    padding: 12,
    fontSize: 16,
    minHeight: 80,
    textAlignVertical: 'top',
    borderWidth: 2,
    borderColor: COLORS.border,
  },
  inputEmergency: {
    borderColor: COLORS.danger,
    backgroundColor: '#FFF5F5',
  },
  optionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
  },
  emergencyToggle: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  emergencyLabel: {
    fontSize: 14,
    color: COLORS.text,
    marginRight: 8,
    fontWeight: '500',
  },
  sendButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  sendButtonDisabled: {
    backgroundColor: COLORS.textLighter,
  },
  emergencySendButton: {
    backgroundColor: COLORS.danger,
  },
  sendButtonText: {
    color: COLORS.surface,
    fontSize: 14,
    fontWeight: '600',
  },
  queueInfo: {
    backgroundColor: '#FFF9E6',
    borderRadius: 8,
    padding: 10,
    marginTop: 10,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.warning,
  },
  queueInfoText: {
    fontSize: 12,
    color: COLORS.textLight,
    lineHeight: 16,
  },
  listHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: COLORS.background,
  },
  listHeaderText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.textLight,
  },
  listHeaderCount: {
    fontSize: 14,
    color: COLORS.textLighter,
  },
  listContent: {
    padding: 16,
  },
});

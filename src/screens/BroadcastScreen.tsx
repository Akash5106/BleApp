// ============================================================================
// BROADCAST SCREEN - WITH QUEUE SYSTEM (FINAL, SAFE)
// Location: src/screens/BroadcastScreen.tsx
// Purpose: Send and view broadcast messages with offline queue (like Bridgefy)
// ============================================================================

import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
} from 'react';
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
import MeshProtocolService from '../services/MeshProtocolService';
import DatabaseService from '../database/DatabaseService';
import BroadcastQueueService from '../services/BroadcastQueueService';

import {
  MeshMessage,
  MessageFlags,
  MessageStatus,
  MessageType,
} from '../types';
import { COLORS, MESH_CONFIG } from '../constants';

export const BroadcastScreen: React.FC = () => {
  const { sendBroadcast, neighbors } = useMeshProtocol();

  const [broadcasts, setBroadcasts] = useState<MeshMessage[]>([]);
  const [queuedCount, setQueuedCount] = useState(0);
  const [inputText, setInputText] = useState('');
  const [isEmergency, setIsEmergency] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  const lastReloadRef = useRef(0);
  const queueFlushedRef = useRef(false);

  const activeNeighbors = neighbors.filter(n => n.isActive);
  const hasActiveNeighbors = activeNeighbors.length > 0;

  // =========================================================================
  // LOAD BROADCASTS FROM DATABASE (optional loader)
  // =========================================================================
  const loadBroadcasts = useCallback(
    async (showLoader = false) => {
      try {
        if (showLoader) setLoading(true);

        const msgs = await DatabaseService.getBroadcastMessages();

        const mapped: MeshMessage[] = msgs.map(m => ({
          id: m.msg_id,
          senderId: m.src_id,
          receiverId: m.dest_id,
          message: m.payload,
          timestamp: m.timestamp,
          isRead: true,
          status: MessageStatus.DELIVERED,
          type: MessageType.BROADCAST,
          ttl: 0,
          isEmergency: !!(
            m.flags && (m.flags & MessageFlags.EMERGENCY)
          ),
        }));

        setBroadcasts(mapped);
      } catch (error) {
        console.error('❌ Failed to load broadcasts:', error);
      } finally {
        if (showLoader) setLoading(false);
      }
    },
    []
  );

  // =========================================================================
  // INITIAL LOAD + QUEUE COUNT SUBSCRIPTION
  // =========================================================================
  useEffect(() => {
    loadBroadcasts(true);

    BroadcastQueueService.getQueueSize().then(setQueuedCount);
    const unsubscribeQueue =
      BroadcastQueueService.onQueueChange(setQueuedCount);

    return unsubscribeQueue;
  }, [loadBroadcasts]);

  // =========================================================================
  // LIVE BROADCAST UPDATES (THROTTLED)
  // =========================================================================
  useEffect(() => {
    const unsubscribe = MeshProtocolService.onMessage(msg => {
      if (
        msg.dest_id === MESH_CONFIG.BROADCAST_ADDRESS &&
        Date.now() - lastReloadRef.current > 500
      ) {
        lastReloadRef.current = Date.now();
        loadBroadcasts();
      }
    });

    return unsubscribe;
  }, [loadBroadcasts]);

  // =========================================================================
  // FLUSH QUEUE WHEN ACTIVE NEIGHBORS APPEAR (SAFE)
  // =========================================================================
  useEffect(() => {
    if (hasActiveNeighbors && !queueFlushedRef.current) {
      queueFlushedRef.current = true;
      BroadcastQueueService.processQueue();
    }

    if (!hasActiveNeighbors) {
      queueFlushedRef.current = false;
    }
  }, [hasActiveNeighbors]);

  // =========================================================================
  // SEND / QUEUE BROADCAST
  // =========================================================================
  const handleSend = async () => {
    if (!inputText.trim() || sending) return;

    const messageText = inputText.trim();
    setInputText('');
    setSending(true);

    try {
      if (hasActiveNeighbors) {
        await sendBroadcast(messageText, isEmergency);
      } else {
        await BroadcastQueueService.queueBroadcast(
          messageText,
          isEmergency
        );
      }

      setIsEmergency(false);
      await loadBroadcasts();
    } catch (error) {
      console.error('❌ Failed to send broadcast:', error);
      setInputText(messageText);
    } finally {
      setSending(false);
    }
  };

  // =========================================================================
  // RENDER BROADCAST ITEM
  // =========================================================================
  const renderBroadcast = ({ item }: { item: MeshMessage }) => (
    <BroadcastCard
      message={item.message}
      senderId={item.senderId}
      timestamp={item.timestamp}
      isEmergency={item.isEmergency === true}
    />
  );

  // =========================================================================
  // UI
  // =========================================================================
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
        {/* HEADER */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Broadcast</Text>
          <Text style={styles.headerSubtitle}>
            Send messages to all nearby devices
          </Text>
        </View>

        {/* STATUS BAR */}
        <View
          style={[
            styles.statusBar,
            hasActiveNeighbors
              ? styles.statusOnline
              : styles.statusOffline,
          ]}
        >
          <View style={styles.statusLeft}>
            <View
              style={[
                styles.statusDot,
                hasActiveNeighbors
                  ? styles.dotOnline
                  : styles.dotOffline,
              ]}
            />
            <Text style={styles.statusText}>
              {hasActiveNeighbors
                ? `${activeNeighbors.length} device${
                    activeNeighbors.length !== 1 ? 's' : ''
                  } online`
                : 'No devices nearby'}
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

        {/* COMPOSE */}
        <View style={styles.composeContainer}>
          <TextInput
            style={[styles.input, isEmergency && styles.inputEmergency]}
            value={inputText}
            onChangeText={setInputText}
            placeholder={
              isEmergency
                ? 'Emergency message…'
                : 'Broadcast a message…'
            }
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
                trackColor={{
                  false: COLORS.textLighter,
                  true: COLORS.danger,
                }}
                thumbColor={COLORS.surface}
              />
            </View>

            <TouchableOpacity
              style={[
                styles.sendButton,
                (!inputText.trim() || sending) &&
                  styles.sendButtonDisabled,
                isEmergency && styles.emergencySendButton,
              ]}
              onPress={handleSend}
              disabled={!inputText.trim() || sending}
            >
              <Text style={styles.sendButtonText}>
                {sending
                  ? '⏳ Sending…'
                  : hasActiveNeighbors
                  ? isEmergency
                    ? '🚨 Send Emergency'
                    : '📢 Broadcast'
                  : isEmergency
                  ? '📦 Queue Emergency'
                  : '📦 Queue Message'}
              </Text>
            </TouchableOpacity>
          </View>

          {!hasActiveNeighbors && (
            <View style={styles.queueInfo}>
              <Text style={styles.queueInfoText}>
                💡 No devices nearby. Message will be queued and sent
                automatically when peers come in range.
              </Text>
            </View>
          )}
        </View>

        {/* LIST */}
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
            keyExtractor={item => item.id}
            contentContainerStyle={styles.listContent}
          />
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

// ============================================================================
// STYLES
// ============================================================================
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { backgroundColor: COLORS.primary, padding: 16 },
  headerTitle: { fontSize: 24, fontWeight: 'bold', color: COLORS.surface },
  headerSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 4,
  },
  statusBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 12,
    borderBottomWidth: 1,
  },
  statusOnline: {
    backgroundColor: '#E8F5E9',
    borderBottomColor: COLORS.success,
  },
  statusOffline: {
    backgroundColor: '#FFF3E0',
    borderBottomColor: COLORS.warning,
  },
  statusLeft: { flexDirection: 'row', alignItems: 'center' },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  dotOnline: { backgroundColor: COLORS.success },
  dotOffline: { backgroundColor: COLORS.warning },
  statusText: { fontSize: 13, fontWeight: '500', color: COLORS.text },
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
    marginTop: 12,
  },
  emergencyToggle: { flexDirection: 'row', alignItems: 'center' },
  emergencyLabel: { fontSize: 14, color: COLORS.text, marginRight: 8 },
  sendButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  sendButtonDisabled: { backgroundColor: COLORS.textLighter },
  emergencySendButton: { backgroundColor: COLORS.danger },
  sendButtonText: { color: COLORS.surface, fontWeight: '600' },
  queueInfo: {
    backgroundColor: '#FFF9E6',
    borderRadius: 8,
    padding: 10,
    marginTop: 10,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.warning,
  },
  queueInfoText: { fontSize: 12, color: COLORS.textLight },
  listContent: { padding: 16 },
});
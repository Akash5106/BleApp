// ============================================================================
// CHAT SCREEN
// Location: src/screens/ChatScreen.tsx
// Purpose: 1-to-1 chat interface with message history (FINAL, SAFE)
// ============================================================================

import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
} from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MessageItem } from '../components/MessageItem';
import { Loading } from '../components/Loading';
import { EmptyState } from '../components/EmptyState';

import { useMeshProtocol } from '../hooks/useMeshProtocol';
import MeshProtocolService from '../services/MeshProtocolService';
import DatabaseService from '../database/DatabaseService';
import ChatQueueService from '../services/ChatQueueService';

import { StoredMessage, QueuedChatMessage, MessageState } from '../types';
import { COLORS } from '../constants';

// =======================
// Props
// =======================
interface ChatScreenProps {
  peerId: string;
  peerName: string;
  onBack: () => void;
}

export const ChatScreen: React.FC<ChatScreenProps> = ({
  peerId,
  peerName,
  onBack,
}) => {
  const { sendChatMessage, neighbors } = useMeshProtocol();

  const [messages, setMessages] = useState<StoredMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [queuedMessages, setQueuedMessages] = useState<QueuedChatMessage[]>([]);

  const flatListRef = useRef<FlatList<StoredMessage>>(null);
  const lastReloadRef = useRef(0);

  // Check if this peer is currently online
  const isPeerOnline = neighbors.some(
    n => n.deviceId === peerId && n.isActive
  );

  // Combine database messages with queued messages for display
  // Queued messages appear with SENDING state (shown as pending)
  const allMessages: StoredMessage[] = [
    ...messages,
    ...queuedMessages.map(q => ({
      msg_id: q.id,
      src_id: 'me', // Will be replaced when actually sent
      dest_id: q.destId,
      flags: 0x01, // CHAT flag
      payload: q.message,
      timestamp: q.timestamp,
      ui_state: MessageState.SENDING, // Shows as "sending/pending"
    })),
  ].sort((a, b) => a.timestamp - b.timestamp);

  // =========================================================================
  // LOAD CHAT HISTORY FROM DB
  // =========================================================================
  const loadMessages = useCallback(
    async (showLoader = false) => {
      try {
        console.log('[CHAT] loadMessages() — peerId:', peerId, '| showLoader:', showLoader);
        if (showLoader) setLoading(true);

        const localDeviceId = MeshProtocolService.getDeviceId();
        const msgs = await DatabaseService.getChatMessages(
          localDeviceId,
          peerId
        );
        setMessages(msgs);
        console.log('[CHAT] loadMessages() — loaded', msgs.length, 'messages');
      } catch (error) {
        console.error('[CHAT] Failed to load chat messages:', error);
      } finally {
        if (showLoader) setLoading(false);
      }
    },
    [peerId]
  );

  // =========================================================================
  // INITIAL LOAD
  // =========================================================================
  useEffect(() => {
    console.log('[CHAT] Initial load — peerId:', peerId, '| peerName:', peerName);
    loadMessages(true);
  }, [loadMessages]);

  // =========================================================================
  // CHAT QUEUE SUBSCRIPTION
  // =========================================================================
  const prevQueueSizeRef = useRef(0);

  useEffect(() => {
    console.log('[CHAT] Setting up queue subscription for peerId:', peerId);
    const unsubscribe = ChatQueueService.onQueueChange(queue => {
      const forThisPeer = queue.filter(msg => msg.destId === peerId);
      const prevSize = prevQueueSizeRef.current;
      prevQueueSizeRef.current = forThisPeer.length;

      setQueuedMessages(forThisPeer);
      console.log('[CHAT] Queue updated — pending for', peerId, ':', forThisPeer.length);

      // If queue size decreased, a message was delivered - reload from DB
      if (forThisPeer.length < prevSize) {
        console.log('[CHAT] Queue shrunk — reloading messages from DB');
        loadMessages();
      }
    });

    return () => {
      console.log('[CHAT] Cleaning up queue subscription');
      unsubscribe();
    };
  }, [peerId, loadMessages]);

  // =========================================================================
  // LIVE MESH UPDATES (THROTTLED)
  // =========================================================================
  useEffect(() => {
    console.log('[CHAT] Setting up live mesh message subscription for peerId:', peerId);
    const unsubscribe = MeshProtocolService.onMessage(msg => {
      if (
        (msg.src_id === peerId || msg.dest_id === peerId) &&
        Date.now() - lastReloadRef.current > 300
      ) {
        console.log('[CHAT] Live update — reloading messages (msg_id:', msg.msg_id, ')');
        lastReloadRef.current = Date.now();
        loadMessages();
      }
    });

    return () => {
      console.log('[CHAT] Cleaning up mesh message subscription');
      unsubscribe();
    };
  }, [peerId, loadMessages]);

  // =========================================================================
  // SCROLL
  // =========================================================================
  const scrollToBottom = () => {
    flatListRef.current?.scrollToEnd({ animated: true });
  };

  // =========================================================================
  // SEND MESSAGE
  // =========================================================================
  const handleSend = async () => {
    if (!inputText.trim() || sending) return;

    const text = inputText.trim();
    console.log('[CHAT] handleSend() — dest:', peerId, '| len:', text.length, '| peerOnline:', isPeerOnline);
    setInputText('');
    setSending(true);

    try {
      if (isPeerOnline) {
        // Peer is online - send directly
        await sendChatMessage(peerId, text);
        console.log('[CHAT] Message sent directly to:', peerId);
      } else {
        // Peer is offline - queue for later delivery
        await ChatQueueService.queueMessage(peerId, text);
        console.log('[CHAT] Message queued for:', peerId);
      }
      await loadMessages();
      scrollToBottom();
    } catch (error) {
      console.error('[CHAT] Failed to send/queue message:', error);
      setInputText(text);
    } finally {
      setSending(false);
    }
  };

  // =========================================================================
  // RENDER MESSAGE
  // =========================================================================
  const renderMessage = ({ item }: { item: StoredMessage }) => {
    const isOwnMessage = item.dest_id === peerId;

    return (
      <MessageItem
        message={item.payload}
        senderId={item.src_id}
        timestamp={item.timestamp}
        isOwnMessage={isOwnMessage}
        status={item.ui_state}
      />
    );
  };

  // =========================================================================
  // UI
  // =========================================================================
  if (loading) {
    return <Loading message="Loading chat..." />;
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Text style={styles.backText}>⬅</Text>
        </TouchableOpacity>
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>
            {peerName || peerId}
          </Text>
          <View style={styles.statusRow}>
            <View
              style={[
                styles.statusDot,
                isPeerOnline ? styles.dotOnline : styles.dotOffline,
              ]}
            />
            <Text style={styles.statusText}>
              {isPeerOnline ? 'Online' : 'Offline'}
            </Text>
            {queuedMessages.length > 0 && (
              <Text style={styles.queuedText}>
                {' '}• {queuedMessages.length} queued
              </Text>
            )}
          </View>
        </View>
      </View>

      {/* BODY */}
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={90}
      >
        {allMessages.length === 0 ? (
          <EmptyState
            icon="💬"
            title="No messages yet"
            description={`Start chatting with ${
              peerName || peerId
            }`}
          />
        ) : (
          <FlatList
            ref={flatListRef}
            data={allMessages}
            renderItem={renderMessage}
            keyExtractor={item => item.msg_id}
            contentContainerStyle={styles.messageList}
            onContentSizeChange={scrollToBottom}
            onLayout={scrollToBottom}
          />
        )}

        {/* INPUT */}
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            value={inputText}
            onChangeText={setInputText}
            placeholder="Type a message..."
            placeholderTextColor={COLORS.textLighter}
            multiline
            maxLength={500}
            editable={!sending}
          />

          <TouchableOpacity
            style={[
              styles.sendButton,
              (!inputText.trim() || sending) && styles.sendButtonDisabled,
              !isPeerOnline && inputText.trim() && !sending && styles.sendButtonQueued,
            ]}
            onPress={handleSend}
            disabled={!inputText.trim() || sending}
          >
            <Text style={styles.sendButtonText}>
              {sending ? '⏳' : isPeerOnline ? '📤' : '📦'}
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

// ============================================================================
// STYLES
// ============================================================================
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: COLORS.primary,
  },
  backButton: { paddingRight: 12 },
  backText: { fontSize: 20, color: COLORS.surface },
  headerContent: { flex: 1 },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.surface,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  dotOnline: { backgroundColor: '#4CAF50' },
  dotOffline: { backgroundColor: '#FFA726' },
  statusText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.8)',
  },
  queuedText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
  },
  messageList: { padding: 16, flexGrow: 1 },
  inputContainer: {
    flexDirection: 'row',
    padding: 12,
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    alignItems: 'flex-end',
  },
  input: {
    flex: 1,
    backgroundColor: COLORS.background,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 16,
    maxHeight: 100,
    color: COLORS.text,
  },
  sendButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 20,
    width: 44,
    height: 44,
    marginLeft: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: COLORS.textLighter,
  },
  sendButtonQueued: {
    backgroundColor: COLORS.warning,
  },
  sendButtonText: { fontSize: 20 },
});

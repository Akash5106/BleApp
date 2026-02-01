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
  SafeAreaView,
} from 'react-native';

import { MessageItem } from '../components/MessageItem';
import { Loading } from '../components/Loading';
import { EmptyState } from '../components/EmptyState';

import { useMeshProtocol } from '../hooks/useMeshProtocol';
import MeshProtocolService from '../services/MeshProtocolService';
import DatabaseService from '../database/DatabaseService';

import { StoredMessage } from '../types';
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
  const { sendChatMessage } = useMeshProtocol();

  const [messages, setMessages] = useState<StoredMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  const flatListRef = useRef<FlatList<StoredMessage>>(null);
  const lastReloadRef = useRef(0); // ✅ FIXED: inside component

  // =========================================================================
  // LOAD CHAT HISTORY FROM DB
  // =========================================================================
  const loadMessages = useCallback(
    async (showLoader = false) => {
      try {
        if (showLoader) setLoading(true);

        const msgs = await DatabaseService.getChatMessages(
          peerId,
          peerId
        );
        setMessages(msgs);
      } catch (error) {
        console.error('❌ Failed to load chat messages:', error);
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
    loadMessages(true);
  }, [loadMessages]);

  // =========================================================================
  // LIVE MESH UPDATES (THROTTLED)
  // =========================================================================
  useEffect(() => {
    const unsubscribe = MeshProtocolService.onMessage(msg => {
      if (
        (msg.src_id === peerId || msg.dest_id === peerId) &&
        Date.now() - lastReloadRef.current > 300
      ) {
        lastReloadRef.current = Date.now();
        loadMessages();
      }
    });

    return unsubscribe;
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
    setInputText('');
    setSending(true);

    try {
      await sendChatMessage(peerId, text);
      await loadMessages();
      scrollToBottom();
    } catch (error) {
      console.error('❌ Failed to send message:', error);
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
        <Text style={styles.headerTitle}>
          {peerName || peerId}
        </Text>
      </View>

      {/* BODY */}
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={90}
      >
        {messages.length === 0 ? (
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
            data={messages}
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
              (!inputText.trim() || sending) &&
                styles.sendButtonDisabled,
            ]}
            onPress={handleSend}
            disabled={!inputText.trim() || sending}
          >
            <Text style={styles.sendButtonText}>
              {sending ? '⏳' : '📤'}
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
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.surface,
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
  sendButtonText: { fontSize: 20 },
});

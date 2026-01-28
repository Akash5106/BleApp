// ============================================================================
// CHAT SCREEN
// Location: src/screens/ChatScreen.tsx
// Purpose: 1-to-1 chat interface with message history
// ============================================================================

import React, { useState, useEffect, useRef } from 'react';
import{  View,
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
import DatabaseService from '../database/DatabaseService';
import { StoredMessage } from '../types';
import { COLORS } from '../constant';

interface ChatScreenProps {
  route: {
    params: {
      peerId: string;
      peerName?: string;
    };
  };
  navigation: any;
}

export const ChatScreen: React.FC<ChatScreenProps> = ({ route, navigation }) => {
  const { peerId, peerName } = route.params;
  const { sendChatMessage } = useMeshProtocol();
  
  const [messages, setMessages] = useState<StoredMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    navigation.setOptions({
      title: peerName || peerId,
    });
    loadMessages();
  }, [peerId]);

  const loadMessages = async () => {
    try {
      setLoading(true);
      const msgs = await DatabaseService.getChatMessages(peerId, peerId);
      setMessages(msgs);
      setTimeout(scrollToBottom, 100);
    } catch (error) {
      console.error('❌ Failed to load messages:', error);
    } finally {
      setLoading(false);
    }
  };

  const scrollToBottom = () => {
    if (messages.length > 0) {
      flatListRef.current?.scrollToEnd({ animated: true });
    }
  };

  const handleSend = async () => {
    if (!inputText.trim() || sending) return;

    const messageText = inputText.trim();
    setInputText('');
    setSending(true);

    try {
      await sendChatMessage(peerId, messageText);
      await loadMessages();
      scrollToBottom();
    } catch (error) {
      console.error('❌ Failed to send message:', error);
      setInputText(messageText); // Restore text on error
    } finally {
      setSending(false);
    }
  };

  const renderMessage = ({ item }: { item: StoredMessage }) => {
    const isMyMessage = item.src_id !== peerId;
    
    return (
      <MessageItem
        message={item.payload}
        senderId={item.src_id}
        timestamp={item.timestamp}
        isOwnMessage={isMyMessage}
        status={item.ui_state}
      />
    );
  };

  if (loading) {
    return <Loading message="Loading chat..." />;
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={90}
      >
        {messages.length === 0 ? (
          <EmptyState
            icon="💬"
            title="No messages yet"
            description={`Start chatting with ${peerName || peerId}`}
          />
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages}
            renderItem={renderMessage}
            keyExtractor={(item) => item.msg_id}
            contentContainerStyle={styles.messageList}
            onContentSizeChange={scrollToBottom}
            onLayout={scrollToBottom}
          />
        )}

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
              (!inputText.trim() || sending) && styles.sendButtonDisabled
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  messageList: {
    padding: 16,
    flexGrow: 1,
  },
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
  sendButtonText: {
    fontSize: 20,
  },
});

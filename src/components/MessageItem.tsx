// ============================================================================
// MESSAGE ITEM COMPONENT
// Location: src/components/MessageItem.tsx
// Purpose: Display individual message bubbles in chat
// ============================================================================

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MessageState } from '../types';

interface MessageItemProps {
  message: string;
  senderId: string;
  timestamp: number;
  isOwnMessage: boolean;
  status?: MessageState;
}

export const MessageItem: React.FC<MessageItemProps> = ({
  message,
  senderId,
  timestamp,
  isOwnMessage,
  status = 'DELIVERED',
}) => {
  const getStatusIcon = (): string => {
    switch (status) {
      case 'SENDING':
        return '⏳';
      case 'SENT':
        return '✓';
      case 'DELIVERED':
        return '✓✓';
      case 'FAILED':
        return '❌';
      default:
        return '';
    }
  };

  const formatTime = (timestamp: number): string => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  return (
    <View style={[
      styles.container,
      isOwnMessage ? styles.ownMessageContainer : styles.otherMessageContainer
    ]}>
      <View style={[
        styles.bubble,
        isOwnMessage ? styles.ownBubble : styles.otherBubble
      ]}>
        {!isOwnMessage && (
          <Text style={styles.senderName}>{senderId}</Text>
        )}
        
        <Text style={[
          styles.messageText,
          isOwnMessage ? styles.ownMessageText : styles.otherMessageText
        ]}>
          {message}
        </Text>
        
        <View style={styles.footer}>
          <Text style={[
            styles.timestamp,
            isOwnMessage ? styles.ownTimestamp : styles.otherTimestamp
          ]}>
            {formatTime(timestamp)}
          </Text>
          {isOwnMessage && (
            <Text style={styles.statusIcon}>{getStatusIcon()}</Text>
          )}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 4,
    marginHorizontal: 12,
  },
  ownMessageContainer: {
    alignItems: 'flex-end',
  },
  otherMessageContainer: {
    alignItems: 'flex-start',
  },
  bubble: {
    maxWidth: '75%',
    borderRadius: 16,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  ownBubble: {
    backgroundColor: '#4A90E2',
    borderBottomRightRadius: 4,
  },
  otherBubble: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderBottomLeftRadius: 4,
  },
  senderName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4A90E2',
    marginBottom: 4,
  },
  messageText: {
    fontSize: 16,
    lineHeight: 20,
  },
  ownMessageText: {
    color: '#FFFFFF',
  },
  otherMessageText: {
    color: '#333333',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginTop: 4,
    gap: 4,
  },
  timestamp: {
    fontSize: 11,
  },
  ownTimestamp: {
    color: 'rgba(255, 255, 255, 0.7)',
  },
  otherTimestamp: {
    color: '#999999',
  },
  statusIcon: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.9)',
  },
});

export default MessageItem;
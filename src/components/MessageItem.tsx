// ============================================================================
// MESSAGE ITEM COMPONENT
// Location: src/components/MessageItem.tsx
// Purpose: Display individual message bubbles in chat
// ============================================================================

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MessageState } from '../types';
import { COLORS } from '../constants';

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
  status = MessageState.CONFIRMED,
}) => {
  const displaySender =
    senderId.length > 8 ? senderId.slice(0, 8) + '…' : senderId;

  const getStatusIcon = (): string => {
    switch (status) {
      case MessageState.SENDING:
        return '⏳';
      case MessageState.MAYBE:
        return '✓';
      case MessageState.CONFIRMED:
        return '✓✓';
      case MessageState.FAILED:
        return '❌';
      default:
        return '';
    }
  };

  const formattedTime = React.useMemo(
    () =>
      new Date(timestamp).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
      }),
    [timestamp]
  );

  return (
    <View
      style={[
        styles.container,
        isOwnMessage ? styles.ownMessageContainer : styles.otherMessageContainer,
      ]}
      accessible
      accessibilityLabel={
        isOwnMessage
          ? `You: ${message}`
          : `${displaySender}: ${message}`
      }
    >
      <View
        style={[
          styles.bubble,
          isOwnMessage ? styles.ownBubble : styles.otherBubble,
        ]}
      >
        {!isOwnMessage && (
          <Text style={styles.senderName}>{displaySender}</Text>
        )}

        <Text
          style={[
            styles.messageText,
            isOwnMessage
              ? styles.ownMessageText
              : styles.otherMessageText,
          ]}
        >
          {message}
        </Text>

        <View style={styles.footer}>
          <Text
            style={[
              styles.timestamp,
              isOwnMessage
                ? styles.ownTimestamp
                : styles.otherTimestamp,
            ]}
          >
            {formattedTime}
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
    backgroundColor: COLORS.primary,
    borderBottomRightRadius: 4,
  },

  otherBubble: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderBottomLeftRadius: 4,
  },

  senderName: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.primary,
    marginBottom: 4,
  },

  messageText: {
    fontSize: 16,
    lineHeight: 20,
  },

  ownMessageText: {
    color: COLORS.surface,
  },

  otherMessageText: {
    color: COLORS.text,
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
    color: COLORS.textLighter,
  },

  statusIcon: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.9)',
  },
});

export default MessageItem;
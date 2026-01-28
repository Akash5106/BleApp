// ============================================================================
// USE MESH PROTOCOL HOOK
// Location: src/hooks/useMeshProtocol.ts
// Purpose: React hook for interacting with mesh protocol
// ============================================================================

import { useState, useEffect, useCallback } from 'react';
import MeshProtocolService from '../services/MeshProtocolService.ts';
import { StoredMessage, NeighborEntry } from '../types';

export interface MeshMessage {
  id: string;
  senderId: string;
  receiverId: string;
  message: string;
  timestamp: number;
  status: string;
  isRead: boolean;
}

export interface Neighbor {
  deviceId: string;
  deviceName?: string;
  lastSeen: number;
  rssi?: number;
  isActive: boolean;
}

export const useMeshProtocol = () => {
  const [neighbors, setNeighbors] = useState<Neighbor[]>([]);
  const [messages, setMessages] = useState<MeshMessage[]>([]);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    // Subscribe to neighbor updates
    const unsubscribeNeighbors = MeshProtocolService.onNeighborsChange((newNeighbors) => {
      const mappedNeighbors: Neighbor[] = newNeighbors.map(n => ({
        deviceId: n.src_id,
        lastSeen: n.lastSeenTime,
        rssi: n.rssi,
        isActive: Date.now() - n.lastSeenTime < 5000,
      }));
      setNeighbors(mappedNeighbors);
    });

    // Subscribe to new messages
    const unsubscribeMessages = MeshProtocolService.onMessage((message) => {
      const meshMessage: MeshMessage = {
        id: message.msg_id,
        senderId: message.src_id,
        receiverId: message.dest_id,
        message: message.payload,
        timestamp: message.timestamp,
        status: message.ui_state,
        isRead: false,
      };
      
      setMessages(prev => [...prev, meshMessage]);
    });

    setIsInitialized(true);

    return () => {
      unsubscribeNeighbors();
      unsubscribeMessages();
    };
  }, []);

  /**
   * Send a chat message to specific device
   */
  const sendChatMessage = useCallback(async (destId: string, message: string): Promise<string> => {
    try {
      const msgId = await MeshProtocolService.sendChatMessage(destId, message);
      return msgId;
    } catch (error) {
      console.error('❌ Failed to send chat message:', error);
      throw error;
    }
  }, []);

  /**
   * Send a broadcast message to all devices
   */
  const sendBroadcast = useCallback(async (message: string, isEmergency: boolean = false): Promise<string> => {
    try {
      const msgId = await MeshProtocolService.sendBroadcastMessage(message, isEmergency);
      return msgId;
    } catch (error) {
      console.error('❌ Failed to send broadcast:', error);
      throw error;
    }
  }, []);

  /**
   * Get currently active neighbors
   */
  const getActiveNeighbors = useCallback((): Neighbor[] => {
    return MeshProtocolService.getActiveNeighbors().map(n => ({
      deviceId: n.src_id,
      lastSeen: n.lastSeenTime,
      rssi: n.rssi,
      isActive: true,
    }));
  }, []);

  /**
   * Get neighbor count
   */
  const getNeighborCount = useCallback((): number => {
    return MeshProtocolService.getActiveNeighbors().length;
  }, []);

  /**
   * Clear all messages (from state, not database)
   */
  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  /**
   * Get messages for specific conversation
   */
  const getConversationMessages = useCallback((deviceId: string): MeshMessage[] => {
    return messages.filter(
      msg => msg.senderId === deviceId || msg.receiverId === deviceId
    );
  }, [messages]);

  /**
   * Get broadcast messages
   */
  const getBroadcastMessages = useCallback((): MeshMessage[] => {
    return messages.filter(msg => msg.receiverId === '0xFFFF');
  }, [messages]);

  /**
   * Mark message as read
   */
  const markAsRead = useCallback((messageId: string) => {
    setMessages(prev =>
      prev.map(msg =>
        msg.id === messageId ? { ...msg, isRead: true } : msg
      )
    );
  }, []);

  /**
   * Get unread message count
   */
  const getUnreadCount = useCallback((deviceId?: string): number => {
    if (deviceId) {
      return messages.filter(
        msg => !msg.isRead && msg.senderId === deviceId
      ).length;
    }
    return messages.filter(msg => !msg.isRead).length;
  }, [messages]);

  return {
    // State
    neighbors,
    messages,
    isInitialized,

    // Actions
    sendChatMessage,
    sendBroadcast,
    getActiveNeighbors,
    getNeighborCount,
    clearMessages,
    getConversationMessages,
    getBroadcastMessages,
    markAsRead,
    getUnreadCount,
  };
};
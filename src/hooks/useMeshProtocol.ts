// ============================================================================
// USE MESH PROTOCOL HOOK
// Location: src/hooks/useMeshProtocol.ts
// Purpose: React hook for interacting with mesh protocol (FINAL, SAFE)
// ============================================================================

import { useState, useEffect, useCallback, useRef } from 'react';
import MeshProtocolService from '../services/MeshProtocolService';
import {
  MeshMessage,
  Neighbor,
  MessageStatus,
  MessageType,
} from '../types';
import { MESH_CONFIG } from '../constants';

// --------------------
// UI status mapping
// --------------------
const mapStatus = (uiState?: string): MessageStatus => {
  switch (uiState) {
    case 'CONFIRMED':
      return MessageStatus.DELIVERED;
    case 'FAILED':
      return MessageStatus.FAILED;
    case 'SENDING':
    default:
      return MessageStatus.SENDING;
  }
};

export const useMeshProtocol = () => {
  const [neighbors, setNeighbors] = useState<Neighbor[]>([]);
  const [messages, setMessages] = useState<MeshMessage[]>([]);
  const [isSubscribed, setIsSubscribed] = useState(false);

  const seenMessageIds = useRef<Set<string>>(new Set());

  // =========================================================================
  // SUBSCRIPTIONS
  // =========================================================================
  useEffect(() => {
    // -------- Neighbors --------
    const unsubscribeNeighbors =
      MeshProtocolService.onNeighborsChange(newNeighbors => {
        const mapped: Neighbor[] = newNeighbors.map(n => ({
          deviceId: n.src_id,
          lastSeen: n.lastSeenTime,
          rssi: n.rssi,
          isActive:
            Date.now() - n.lastSeenTime <
            MESH_CONFIG.NEIGHBOR_ACTIVE_THRESHOLD,
        }));
        setNeighbors(mapped);
      });

    // -------- Messages --------
    const unsubscribeMessages =
      MeshProtocolService.onMessage(message => {
        const meshMessage: MeshMessage = {
          id: message.msg_id,
          senderId: message.src_id,
          receiverId: message.dest_id,
          message: message.payload,
          timestamp: message.timestamp ?? Date.now(),
          isRead: false,
          status: mapStatus(message.ui_state),
          type:
            message.dest_id === MESH_CONFIG.BROADCAST_ADDRESS
              ? MessageType.BROADCAST
              : MessageType.CHAT,
          ttl: 0, // ✅ REQUIRED by MeshMessage type
        };

        setMessages(prev => {
          if (seenMessageIds.current.has(meshMessage.id)) {
            return prev;
          }

          seenMessageIds.current.add(meshMessage.id);

          const updated = [...prev, meshMessage];
          return updated.length > 500
            ? updated.slice(updated.length - 500)
            : updated;
        });
      });

    setIsSubscribed(true);

    return () => {
      unsubscribeNeighbors();
      unsubscribeMessages();
      seenMessageIds.current.clear();
    };
  }, []);

  // =========================================================================
  // ACTIONS
  // =========================================================================
  const sendChatMessage = useCallback(
    async (destId: string, message: string): Promise<string> => {
      return MeshProtocolService.sendChatMessage(destId, message);
    },
    []
  );

  const sendBroadcast = useCallback(
    async (message: string, isEmergency = false): Promise<string> => {
      return MeshProtocolService.sendBroadcastMessage(
        message,
        isEmergency
      );
    },
    []
  );

  // =========================================================================
  // HELPERS
  // =========================================================================
  const getActiveNeighbors = useCallback(
    () => neighbors.filter(n => n.isActive),
    [neighbors]
  );

  const getNeighborCount = useCallback(
    () => neighbors.filter(n => n.isActive).length,
    [neighbors]
  );

  const clearMessages = useCallback(() => {
    seenMessageIds.current.clear();
    setMessages([]);
  }, []);

  const getConversationMessages = useCallback(
    (peerId: string) =>
      messages.filter(
        m =>
          m.senderId === peerId ||
          m.receiverId === peerId
      ),
    [messages]
  );

  const getBroadcastMessages = useCallback(
    () =>
      messages.filter(
        m => m.receiverId === MESH_CONFIG.BROADCAST_ADDRESS
      ),
    [messages]
  );

  const markAsRead = useCallback((messageId: string) => {
    setMessages(prev =>
      prev.map(m =>
        m.id === messageId ? { ...m, isRead: true } : m
      )
    );
  }, []);

  const getUnreadCount = useCallback(
    (peerId?: string) => {
      if (peerId) {
        return messages.filter(
          m => !m.isRead && m.senderId === peerId
        ).length;
      }
      return messages.filter(m => !m.isRead).length;
    },
    [messages]
  );

  return {
    neighbors,
    messages,
    isSubscribed,

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

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
    console.log('[HOOK] useMeshProtocol — setting up subscriptions');
    // -------- Neighbors --------
    const unsubscribeNeighbors =
      MeshProtocolService.onNeighborsChange(newNeighbors => {
        console.log('[HOOK] Neighbors updated — count:', newNeighbors.length);
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
        console.log('[HOOK] Message received — msg_id:', message.msg_id, '| src:', message.src_id, '| dest:', message.dest_id);
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
          ttl: message.ttl ?? 0,
        };

        setMessages(prev => {
          if (seenMessageIds.current.has(meshMessage.id)) {
            console.log('[HOOK] Duplicate message skipped:', meshMessage.id);
            return prev;
          }

          seenMessageIds.current.add(meshMessage.id);
          console.log('[HOOK] Message added to state — total:', prev.length + 1);

          const updated = [...prev, meshMessage];
          return updated.length > 500
            ? updated.slice(updated.length - 500)
            : updated;
        });
      });

    setIsSubscribed(true);

    return () => {
      console.log('[HOOK] useMeshProtocol — cleaning up subscriptions');
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
      console.log('[HOOK] sendChatMessage() — dest:', destId, '| len:', message.length);
      return MeshProtocolService.sendChatMessage(destId, message);
    },
    []
  );

  const sendBroadcast = useCallback(
    async (message: string, isEmergency = false): Promise<string> => {
      console.log('[HOOK] sendBroadcast() — emergency:', isEmergency, '| len:', message.length);
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

// ============================================================================
// MESH MESSAGE MODEL
// Location: src/models/MeshMessage.ts
// Purpose: Data models and interfaces for mesh messaging
// ============================================================================

export enum MessageType {
  CHAT = 'CHAT',
  BROADCAST = 'BROADCAST',
  EMERGENCY = 'EMERGENCY',
}

export enum MessageStatus {
  SENDING = 'SENDING',
  SENT = 'SENT',
  DELIVERED = 'DELIVERED',
  FAILED = 'FAILED',
}

export interface MeshMessage {
  id: string;
  senderId: string;
  receiverId: string;
  message: string;
  type: MessageType;
  status: MessageStatus;
  timestamp: number;
  ttl: number;
  isRead: boolean;
}

export interface MeshPacket {
  msg_id: string;
  src_id: string;
  dest_id: string;
  flags: number;
  ttl: number;
  payload: string;
  timestamp: number;
}

export interface SeenMessage {
  msg_id: string;
  timestamp: number;
  status: 'FORWARDED' | 'CONSUMED';
}

export interface Neighbor {
  deviceId: string;
  deviceName?: string;
  lastSeen: number;
  rssi?: number;
  isActive: boolean;
}

export interface UserProfile {
  deviceId: string;
  username: string;
  publicKey?: string;
  privateKey?: string;
}

export interface ChatConversation {
  peerId: string;
  peerName?: string;
  lastMessage?: string;
  lastMessageTime?: number;
  unreadCount: number;
}

export interface BroadcastMessage {
  id: string;
  senderId: string;
  message: string;
  timestamp: number;
  isEmergency: boolean;
}

export interface NetworkStats {
  totalMessages: number;
  totalNeighbors: number;
  activeNeighbors: number;
  messagesReceived: number;
  messagesSent: number;
}

// Message flags as bitmask
export const MessageFlags = {
  CHAT: 0x01,
  BROADCAST: 0x02,
  EMERGENCY: 0x04,
} as const;
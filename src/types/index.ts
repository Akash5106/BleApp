// ============================================================================
// TYPES
// Location: src/types/index.ts
// Purpose: All TypeScript type definitions for the mesh app
// ============================================================================

// ============================================================================
// ENUMS
// ============================================================================

export enum MessageFlags {
  CHAT = 0x01,
  BROADCAST = 0x02,
  EMERGENCY = 0x04,
}

export enum MessageState {
  SENDING = 'SENDING',
  MAYBE = 'MAYBE',
  CONFIRMED = 'CONFIRMED',
  FAILED = 'FAILED',
}

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

// ============================================================================
// MESH PROTOCOL TYPES
// ============================================================================

export interface MeshPacket {
  msg_id: string;              // UUID v4 or 64-bit hash
  src_id: string;              // Short device ID (2-4 bytes)
  dest_id: string;             // Device ID or 0xFFFF for broadcast
  flags: number;               // Bitmask (CHAT/BROADCAST/EMERGENCY)
  ttl: number;                 // Time to live / hop count
  payload: string;             // Encrypted or plain text
  timestamp?: number;          // Optional timestamp
}

export interface StoredMessage {
  msg_id: string;
  src_id: string;
  dest_id: string;
  flags: number;
  payload: string;
  timestamp: number;
  ui_state: MessageState;
  ttl?: number;
}

export interface SeenMessageEntry {
  msg_id: string;
  timestamp: number;
  forwarded: boolean;
}

export interface NeighborEntry {
  src_id: string;
  lastSeenTime: number;
  rssi?: number;
}

// ============================================================================
// UI/APP TYPES
// ============================================================================

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
  isEmergency?: boolean;
}

export interface Neighbor {
  deviceId: string;
  deviceName?: string;
  lastSeen: number;
  rssi?: number;
  isActive: boolean;
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

// ============================================================================
// USER & SETTINGS TYPES
// ============================================================================

export interface UserSettings {
  device_id: string;
  username: string;
  encryptionEnabled: boolean;
  cryptoKeys?: {
    publicKey: string;
    privateKey: string;
  };
}

export interface UserProfile {
  deviceId: string;
  username: string;
  avatar?: string;
  publicKey?: string;
}

// ============================================================================
// BLE TYPES
// ============================================================================

export interface BLEDevice {
  id: string;
  name?: string;
  rssi?: number;
}

export interface BLEPermissionsState {
  granted: boolean;
  checking: boolean;
  bluetoothEnabled: boolean;
}

// ============================================================================
// NETWORK & STATS TYPES
// ============================================================================

export interface NetworkStats {
  totalMessages: number;
  totalNeighbors: number;
  activeNeighbors: number;
  messagesReceived: number;
  messagesSent: number;
  messagesFailed: number;
}

export interface TTLConfig {
  baseTTL: number;
  maxTTL: number;
  adaptiveEnabled: boolean;
}

// ============================================================================
// NAVIGATION TYPES
// ============================================================================

export type RootStackParamList = {
  NearbyPeers: undefined;
  Chat: {
    peerId: string;
    peerName?: string;
  };
  Broadcast: undefined;
  Settings: undefined;
};

// ============================================================================
// UTILITY TYPES
// ============================================================================

export type LoadingState = 'idle' | 'loading' | 'success' | 'error';

export interface AsyncResult<T> {
  data?: T;
  error?: Error;
  loading: boolean;
}

// ============================================================================
// COMPONENT PROP TYPES
// ============================================================================

export interface MessageItemProps {
  message: string;
  senderId: string;
  timestamp: number;
  isOwnMessage: boolean;
  status?: MessageState;
}

export interface PeerCardProps {
  deviceId: string;
  deviceName?: string;
  lastSeen: number;
  rssi?: number;
  isActive: boolean;
  onPress: () => void;
}

export interface BroadcastCardProps {
  message: string;
  senderId: string;
  timestamp: number;
  isEmergency?: boolean;
}

export interface EmptyStateProps {
  icon: string;
  title: string;
  description: string;
  action?: React.ReactNode;
}

export interface LoadingProps {
  message?: string;
  size?: 'small' | 'large';
  color?: string;
}

export * from './broadcast';
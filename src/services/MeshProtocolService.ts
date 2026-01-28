// ============================================================================
// MESH PROTOCOL SERVICE - MOST IMPORTANT FILE
// Copy to: your-project/src/services/MeshProtocolService.ts
// ============================================================================

import {
  MeshPacket,
  SeenMessageEntry,
  NeighborEntry,
  MessageFlags,
  MessageState,
  StoredMessage,
} from '../types';
import DatabaseService from '../database/DatabaseService';
import BLEService from './BLEService';
import { v4 as uuidv4 } from 'uuid';

const CONFIG = {
  SEEN_MESSAGES_MAX: 1000,
  SEEN_MESSAGE_TTL: 60000,
  NEIGHBOR_CACHE_MAX: 100,
  NEIGHBOR_EXPIRY: 10000,
  FORWARDING_JITTER_MIN: 50,
  FORWARDING_JITTER_MAX: 200,
  REDUNDANCY_COUNT: 3,
  BASE_TTL_CHAT: 2,
  BASE_TTL_BROADCAST: 5,
  ADAPTIVE_TTL_THRESHOLD: 3,
};

class MeshProtocolService {
  private seenMessages: Map<string, SeenMessageEntry> = new Map();
  private forwardingQueue: MeshPacket[] = [];
  private neighborCache: Map<string, NeighborEntry> = new Map();
  private deviceId: string = '';
  private isInitialized: boolean = false;
  private messageListeners: Array<(message: StoredMessage) => void> = [];
  private neighborListeners: Array<(neighbors: NeighborEntry[]) => void> = [];

  async init(deviceId: string): Promise<void> {
    this.deviceId = deviceId;
    this.isInitialized = true;
    this.startCleanupTasks();
    console.log('✅ MeshProtocolService initialized with ID:', deviceId);
  }

  async sendChatMessage(destId: string, payload: string): Promise<string> {
    const packet: MeshPacket = {
      msg_id: uuidv4(),
      src_id: this.deviceId,
      dest_id: destId,
      flags: MessageFlags.CHAT,
      ttl: this.calculateTTL(MessageFlags.CHAT),
      payload,
      timestamp: Date.now(),
    };
    return this.sendPacket(packet);
  }

  async sendBroadcastMessage(payload: string, isEmergency: boolean = false): Promise<string> {
    const flags = isEmergency 
      ? MessageFlags.BROADCAST | MessageFlags.EMERGENCY
      : MessageFlags.BROADCAST;

    const packet: MeshPacket = {
      msg_id: uuidv4(),
      src_id: this.deviceId,
      dest_id: '0xFFFF',
      flags,
      ttl: CONFIG.BASE_TTL_BROADCAST,
      payload,
      timestamp: Date.now(),
    };
    return this.sendPacket(packet);
  }

  private async sendPacket(packet: MeshPacket): Promise<string> {
    this.seenMessages.set(packet.msg_id, {
      msg_id: packet.msg_id,
      timestamp: Date.now(),
      status: 'CONSUMED',
    });

    const storedMessage: StoredMessage = {
      msg_id: packet.msg_id,
      src_id: packet.src_id,
      dest_id: packet.dest_id,
      flags: packet.flags,
      payload: packet.payload,
      timestamp: packet.timestamp!,
      ui_state: MessageState.SENDING,
    };
    await DatabaseService.saveMessage(storedMessage);
    await this.advertisePacketWithRedundancy(packet);
    return packet.msg_id;
  }

  private async advertisePacketWithRedundancy(packet: MeshPacket): Promise<void> {
    for (let i = 0; i < CONFIG.REDUNDANCY_COUNT; i++) {
      const jitter = Math.random() * (CONFIG.FORWARDING_JITTER_MAX - CONFIG.FORWARDING_JITTER_MIN) + CONFIG.FORWARDING_JITTER_MIN;
      setTimeout(async () => {
        await BLEService.advertisePacket(packet);
      }, i === 0 ? 0 : jitter * (i + 1));
    }
  }

  async onPacketReceived(packet: MeshPacket): Promise<void> {
    if (this.seenMessages.has(packet.msg_id)) {
      return;
    }

    if (packet.src_id === this.deviceId) {
      return;
    }

    this.seenMessages.set(packet.msg_id, {
      msg_id: packet.msg_id,
      timestamp: Date.now(),
      status: 'FORWARDED',
    });

    this.updateNeighborCache(packet.src_id);

    const isForMe = packet.dest_id === this.deviceId;
    const isBroadcast = packet.dest_id === '0xFFFF';

    if (isForMe || isBroadcast) {
      await this.deliverToUI(packet);
    }

    if (packet.ttl > 0) {
      await this.forwardPacket(packet);
    }
  }

  private async forwardPacket(packet: MeshPacket): Promise<void> {
    const forwardedPacket = {
      ...packet,
      ttl: packet.ttl - 1,
    };

    const delay = Math.random() * (CONFIG.FORWARDING_JITTER_MAX - CONFIG.FORWARDING_JITTER_MIN) + CONFIG.FORWARDING_JITTER_MIN;

    setTimeout(async () => {
      await BLEService.advertisePacket(forwardedPacket);
    }, delay);
  }

  private async deliverToUI(packet: MeshPacket): Promise<void> {
    const storedMessage: StoredMessage = {
      msg_id: packet.msg_id,
      src_id: packet.src_id,
      dest_id: packet.dest_id,
      flags: packet.flags,
      payload: packet.payload,
      timestamp: packet.timestamp || Date.now(),
      ui_state: MessageState.CONFIRMED,
    };

    await DatabaseService.saveMessage(storedMessage);
    this.messageListeners.forEach(listener => listener(storedMessage));
  }

  private updateNeighborCache(srcId: string): void {
    this.neighborCache.set(srcId, {
      src_id: srcId,
      lastSeenTime: Date.now(),
    });

    if (this.neighborCache.size > CONFIG.NEIGHBOR_CACHE_MAX) {
      const oldestKey = Array.from(this.neighborCache.entries())
        .sort((a, b) => a[1].lastSeenTime - b[1].lastSeenTime)[0][0];
      this.neighborCache.delete(oldestKey);
    }

    this.notifyNeighborListeners();
  }

  private calculateTTL(flags: number): number {
    const neighborCount = this.getActiveNeighbors().length;
    
    if (flags & MessageFlags.BROADCAST || flags & MessageFlags.EMERGENCY) {
      return CONFIG.BASE_TTL_BROADCAST;
    }

    let ttl = CONFIG.BASE_TTL_CHAT;
    if (neighborCount >= CONFIG.ADAPTIVE_TTL_THRESHOLD) {
      ttl = 2;
    } else if (neighborCount < CONFIG.ADAPTIVE_TTL_THRESHOLD) {
      ttl = 3;
    }

    return ttl;
  }

  getActiveNeighbors(): NeighborEntry[] {
    const now = Date.now();
    return Array.from(this.neighborCache.values())
      .filter(neighbor => now - neighbor.lastSeenTime < CONFIG.NEIGHBOR_EXPIRY);
  }

  private startCleanupTasks(): void {
    setInterval(() => {
      this.cleanSeenMessages();
    }, 30000);

    setInterval(() => {
      this.cleanNeighborCache();
    }, 10000);
  }

  private cleanSeenMessages(): void {
    const now = Date.now();
    const entriesToDelete: string[] = [];

    this.seenMessages.forEach((entry, msgId) => {
      if (now - entry.timestamp > CONFIG.SEEN_MESSAGE_TTL) {
        entriesToDelete.push(msgId);
      }
    });

    entriesToDelete.forEach(msgId => this.seenMessages.delete(msgId));

    if (this.seenMessages.size > CONFIG.SEEN_MESSAGES_MAX) {
      const sortedEntries = Array.from(this.seenMessages.entries())
        .sort((a, b) => a[1].timestamp - b[1].timestamp);
      
      const toDelete = sortedEntries.slice(0, sortedEntries.length - CONFIG.SEEN_MESSAGES_MAX);
      toDelete.forEach(([msgId]) => this.seenMessages.delete(msgId));
    }

    console.log(`🧹 Cleaned seen messages. Current size: ${this.seenMessages.size}`);
  }

  private cleanNeighborCache(): void {
    const now = Date.now();
    const entriesToDelete: string[] = [];

    this.neighborCache.forEach((entry, srcId) => {
      if (now - entry.lastSeenTime > CONFIG.NEIGHBOR_EXPIRY) {
        entriesToDelete.push(srcId);
      }
    });

    entriesToDelete.forEach(srcId => this.neighborCache.delete(srcId));
    
    if (entriesToDelete.length > 0) {
      this.notifyNeighborListeners();
    }
  }

  private notifyNeighborListeners(): void {
    const activeNeighbors = this.getActiveNeighbors();
    this.neighborListeners.forEach(listener => listener(activeNeighbors));
  }

  onMessage(callback: (message: StoredMessage) => void): () => void {
    this.messageListeners.push(callback);
    return () => {
      this.messageListeners = this.messageListeners.filter(cb => cb !== callback);
    };
  }

  onNeighborsChange(callback: (neighbors: NeighborEntry[]) => void): () => void {
    this.neighborListeners.push(callback);
    return () => {
      this.neighborListeners = this.neighborListeners.filter(cb => cb !== callback);
    };
  }
}

export default new MeshProtocolService();
// ============================================================================
// MESH PROTOCOL SERVICE - FIXED & SAFE VERSION
// Location: src/services/MeshProtocolService.ts
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
import { MESH_CONFIG } from '../constants';

class MeshProtocolService {
  private seenMessages: Map<string, SeenMessageEntry> = new Map();
  private neighborCache: Map<string, NeighborEntry> = new Map();
  private deviceId: string = '';
  private isInitialized: boolean = false;

  private messageListeners: Array<(message: StoredMessage) => void> = [];
  private neighborListeners: Array<(neighbors: NeighborEntry[]) => void> = [];

  // =========================================================================
  // INITIALIZATION
  // =========================================================================
  async init(deviceId: string): Promise<void> {
    this.deviceId = deviceId;
    this.isInitialized = true;
    this.startCleanupTasks();
    console.log('✅ MeshProtocolService initialized with ID:', deviceId);
  }

  private ensureInitialized(): void {
    if (!this.isInitialized || !this.deviceId) {
      throw new Error('❌ MeshProtocolService not initialized');
    }
  }

  // =========================================================================
  // SEND MESSAGES
  // =========================================================================
  async sendChatMessage(destId: string, payload: string): Promise<string> {
    this.ensureInitialized();

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

  async sendBroadcastMessage(payload: string, isEmergency = false): Promise<string> {
    this.ensureInitialized();

    const flags = isEmergency
      ? MessageFlags.BROADCAST | MessageFlags.EMERGENCY
      : MessageFlags.BROADCAST;

    const packet: MeshPacket = {
      msg_id: uuidv4(),
      src_id: this.deviceId,
      dest_id: MESH_CONFIG.BROADCAST_ADDRESS,
      flags,
      ttl: this.calculateTTL(flags),
      payload,
      timestamp: Date.now(),
    };

    return this.sendPacket(packet);
  }

  private async sendPacket(packet: MeshPacket): Promise<string> {
    this.seenMessages.set(packet.msg_id, {
      msg_id: packet.msg_id,
      timestamp: Date.now(),
      forwarded: false,
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

  // =========================================================================
  // RECEIVING / FORWARDING
  // =========================================================================
  async onPacketReceived(packet: MeshPacket): Promise<void> {
    if (packet.src_id === this.deviceId) return;

    const entry = this.seenMessages.get(packet.msg_id);
    if (entry) {
      if (packet.ttl > 0 && !entry.forwarded) {
        entry.forwarded = true;
        await this.forwardPacket(packet);
      }
      return;
    }

    this.seenMessages.set(packet.msg_id, {
      msg_id: packet.msg_id,
      timestamp: Date.now(),
      forwarded: false,
    });

    // 🔵 Logical neighbor (packet sender)
    this.updateNeighborCache(packet.src_id);

    const isForMe = packet.dest_id === this.deviceId;
    const isBroadcast = packet.dest_id === MESH_CONFIG.BROADCAST_ADDRESS;

    if (isForMe || isBroadcast) {
      await this.deliverToUI(packet);
    }

    const newEntry = this.seenMessages.get(packet.msg_id)!;
    if (packet.ttl > 0 && !newEntry.forwarded) {
      newEntry.forwarded = true;
      await this.forwardPacket(packet);
    }
  }

  private async forwardPacket(packet: MeshPacket): Promise<void> {
    const forwardedPacket: MeshPacket = {
      ...packet,
      ttl: packet.ttl - 1,
    };

    const delay =
      Math.random() *
        (MESH_CONFIG.FORWARDING_JITTER_MAX - MESH_CONFIG.FORWARDING_JITTER_MIN) +
      MESH_CONFIG.FORWARDING_JITTER_MIN;

    setTimeout(() => {
      BLEService.advertisePacket(forwardedPacket);
    }, delay);
  }

  private async advertisePacketWithRedundancy(packet: MeshPacket): Promise<void> {
    for (let i = 0; i < MESH_CONFIG.REDUNDANCY_COUNT; i++) {
      const jitter =
        Math.random() *
          (MESH_CONFIG.FORWARDING_JITTER_MAX - MESH_CONFIG.FORWARDING_JITTER_MIN) +
        MESH_CONFIG.FORWARDING_JITTER_MIN;

      setTimeout(() => {
        BLEService.advertisePacket(packet);
      }, i === 0 ? 0 : jitter * (i + 1));
    }
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
    this.messageListeners.forEach(cb => cb(storedMessage));
  }

  // =========================================================================
  // NEIGHBORS
  // =========================================================================
  private updateNeighborCache(srcId: string): void {
    this.neighborCache.set(srcId, {
      src_id: srcId,
      lastSeenTime: Date.now(),
    });

    if (this.neighborCache.size > MESH_CONFIG.NEIGHBOR_CACHE_MAX) {
      const oldest = Array.from(this.neighborCache.entries()).sort(
        (a, b) => a[1].lastSeenTime - b[1].lastSeenTime
      )[0][0];
      this.neighborCache.delete(oldest);
    }

    this.notifyNeighborListeners();
  }

  // 🔥 NEW: physical neighbor update (scanner-only fix)
  updatePhysicalNeighbor(deviceId: string): void {
    this.updateNeighborCache(deviceId);
  }

  getActiveNeighbors(): NeighborEntry[] {
    const now = Date.now();
    return Array.from(this.neighborCache.values()).filter(
      n => now - n.lastSeenTime < MESH_CONFIG.NEIGHBOR_EXPIRY
    );
  }

  private calculateTTL(flags: number): number {
  // 🚨 Emergency broadcasts get max spread
  if (flags & MessageFlags.EMERGENCY) {
    return MESH_CONFIG.BASE_TTL_BROADCAST;
  }

  // 📢 Normal broadcasts still spread, but controlled
  if (flags & MessageFlags.BROADCAST) {
    return Math.min(
      MESH_CONFIG.BASE_TTL_BROADCAST - 1,
      MESH_CONFIG.MAX_TTL
    );
  }

  // 💬 Chat messages: adaptive
  const neighbors = this.getActiveNeighbors().length;
  return neighbors >= MESH_CONFIG.ADAPTIVE_TTL_THRESHOLD ? 2 : 3;
}


  // =========================================================================
  // CLEANUP
  // =========================================================================
  private startCleanupTasks(): void {
    setInterval(() => this.cleanSeenMessages(), MESH_CONFIG.CLEANUP_INTERVAL_SEEN);
    setInterval(() => this.cleanNeighborCache(), MESH_CONFIG.CLEANUP_INTERVAL_NEIGHBORS);
  }

  private cleanSeenMessages(): void {
    const now = Date.now();
    for (const [id, entry] of this.seenMessages) {
      if (now - entry.timestamp > MESH_CONFIG.SEEN_MESSAGE_TTL) {
        this.seenMessages.delete(id);
      }
    }
  }

  private cleanNeighborCache(): void {
    const now = Date.now();
    let changed = false;

    for (const [id, entry] of this.neighborCache) {
      if (now - entry.lastSeenTime > MESH_CONFIG.NEIGHBOR_EXPIRY) {
        this.neighborCache.delete(id);
        changed = true;
      }
    }

    if (changed) this.notifyNeighborListeners();
  }

  private notifyNeighborListeners(): void {
    const active = this.getActiveNeighbors();
    this.neighborListeners.forEach(cb => cb(active));
  }

  // =========================================================================
  // SUBSCRIPTIONS
  // =========================================================================
  onMessage(cb: (message: StoredMessage) => void): () => void {
    this.messageListeners.push(cb);
    return () => {
      this.messageListeners = this.messageListeners.filter(l => l !== cb);
    };
  }

  onNeighborsChange(cb: (neighbors: NeighborEntry[]) => void): () => void {
    this.neighborListeners.push(cb);
    return () => {
      this.neighborListeners = this.neighborListeners.filter(l => l !== cb);
    };
  }
}

export default new MeshProtocolService();
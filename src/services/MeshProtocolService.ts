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
import { generateUUID } from '../utils/helpers';
import { MESH_CONFIG } from '../constants';

// Lazy import to avoid circular dependency
const getChatQueueService = () => require('./ChatQueueService').default;

class MeshProtocolService {
  private seenMessages: Map<string, SeenMessageEntry> = new Map();
  private neighborCache: Map<string, NeighborEntry> = new Map();
  private deviceId: string = '';
  private isInitialized: boolean = false;

  private messageListeners: Array<(message: StoredMessage) => void> = [];
  private neighborListeners: Array<(neighbors: NeighborEntry[]) => void> = [];

  // Throttle neighbor notifications to prevent React overwhelm
  private neighborNotifyPending = false;
  private neighborNotifyTimeout: ReturnType<typeof setTimeout> | null = null;
  private readonly NEIGHBOR_NOTIFY_THROTTLE = 500; // Max once per 500ms

  // =========================================================================
  // INITIALIZATION
  // =========================================================================
  async init(deviceId: string): Promise<void> {
    console.log('[MESH] init() called with deviceId:', deviceId);
    this.deviceId = deviceId;
    this.isInitialized = true;
    this.startCleanupTasks();
    console.log('[MESH] Initialized — deviceId:', deviceId, '| cleanup tasks started');
  }

  private ensureInitialized(): void {
    if (!this.isInitialized || !this.deviceId) {
      console.error('[MESH] ensureInitialized FAILED — isInitialized:', this.isInitialized, '| deviceId:', this.deviceId);
      throw new Error('[MESH] MeshProtocolService not initialized');
    }
  }

  // =========================================================================
  // SEND MESSAGES
  // =========================================================================
  async sendChatMessage(destId: string, payload: string): Promise<string> {
    console.log('[MESH] sendChatMessage() — to:', destId, '| len:', payload.length);
    this.ensureInitialized();

    const packet: MeshPacket = {
      msg_id: generateUUID(),
      src_id: this.deviceId,
      dest_id: destId,
      flags: MessageFlags.CHAT,
      ttl: this.calculateTTL(MessageFlags.CHAT),
      payload,
      timestamp: Date.now(),
    };

    console.log('[MESH] Chat packet created — msg_id:', packet.msg_id, '| ttl:', packet.ttl);
    return this.sendPacket(packet);
  }

  async sendBroadcastMessage(payload: string, isEmergency = false): Promise<string> {
    console.log('[MESH] sendBroadcastMessage() — emergency:', isEmergency, '| len:', payload.length);
    this.ensureInitialized();

    const flags = isEmergency
      ? MessageFlags.BROADCAST | MessageFlags.EMERGENCY
      : MessageFlags.BROADCAST;

    const packet: MeshPacket = {
      msg_id: generateUUID(),
      src_id: this.deviceId,
      dest_id: MESH_CONFIG.BROADCAST_ADDRESS,
      flags,
      ttl: this.calculateTTL(flags),
      payload,
      timestamp: Date.now(),
    };

    console.log('[MESH] Broadcast packet created — msg_id:', packet.msg_id, '| ttl:', packet.ttl, '| flags:', flags);
    return this.sendPacket(packet);
  }

  private async sendPacket(packet: MeshPacket): Promise<string> {
    console.log('[MESH] sendPacket() — msg_id:', packet.msg_id, '| src:', packet.src_id, '| dest:', packet.dest_id);
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
    console.log('[MESH] Message saved to DB — msg_id:', packet.msg_id, '| state:', storedMessage.ui_state);
    await this.advertisePacketWithRedundancy(packet);
    console.log('[MESH] Packet queued for redundant transmission (x' + MESH_CONFIG.REDUNDANCY_COUNT + ')');

    return packet.msg_id;
  }

  // =========================================================================
  // RECEIVING / FORWARDING
  // =========================================================================
  async onPacketReceived(packet: MeshPacket): Promise<void> {
    console.log('[MESH] onPacketReceived() — msg_id:', packet.msg_id, '| src:', packet.src_id, '| dest:', packet.dest_id, '| ttl:', packet.ttl, '| flags:', packet.flags);

    if (packet.src_id === this.deviceId) {
      console.log('[MESH] Ignoring own packet — msg_id:', packet.msg_id);
      return;
    }

    const entry = this.seenMessages.get(packet.msg_id);
    if (entry) {
      console.log('[MESH] Already seen — msg_id:', packet.msg_id, '| forwarded:', entry.forwarded);
      if (packet.ttl > 0 && !entry.forwarded) {
        console.log('[MESH] Forwarding previously-seen packet — msg_id:', packet.msg_id);
        entry.forwarded = true;
        await this.forwardPacket(packet);
      }
      return;
    }

    console.log('[MESH] New packet — msg_id:', packet.msg_id, '| seenCache size:', this.seenMessages.size);
    this.seenMessages.set(packet.msg_id, {
      msg_id: packet.msg_id,
      timestamp: Date.now(),
      forwarded: false,
    });

    this.updateNeighborCache(packet.src_id);

    const isForMe = packet.dest_id === this.deviceId;
    const isBroadcast = packet.dest_id === MESH_CONFIG.BROADCAST_ADDRESS;
    console.log('[MESH] Packet routing — isForMe:', isForMe, '| isBroadcast:', isBroadcast);

    if (isForMe || isBroadcast) {
      console.log('[MESH] Delivering to UI — msg_id:', packet.msg_id);
      await this.deliverToUI(packet);
    }

    const newEntry = this.seenMessages.get(packet.msg_id)!;
    if (packet.ttl > 0 && !newEntry.forwarded) {
      console.log('[MESH] Forwarding new packet — msg_id:', packet.msg_id, '| ttl:', packet.ttl);
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

    console.log('[MESH] forwardPacket() — msg_id:', packet.msg_id, '| newTTL:', forwardedPacket.ttl, '| delay:', Math.round(delay) + 'ms');
    setTimeout(() => {
      BLEService.advertisePacket(forwardedPacket);
    }, delay);
  }

  private async advertisePacketWithRedundancy(packet: MeshPacket): Promise<void> {
    console.log('[MESH] advertisePacketWithRedundancy() — msg_id:', packet.msg_id, '| count:', MESH_CONFIG.REDUNDANCY_COUNT);
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
    console.log('[MESH] deliverToUI() — msg_id:', packet.msg_id, '| payload:', packet.payload.substring(0, 50), '| listeners:', this.messageListeners.length);
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
    const isNew = !this.neighborCache.has(srcId);
    const existing = this.neighborCache.get(srcId);
    this.neighborCache.set(srcId, {
      src_id: srcId,
      lastSeenTime: Date.now(),
      rssi: existing?.rssi,
    });
    console.log('[MESH] updateNeighborCache() —', isNew ? 'NEW' : 'UPDATE', '| srcId:', srcId, '| cacheSize:', this.neighborCache.size);

    if (this.neighborCache.size > MESH_CONFIG.NEIGHBOR_CACHE_MAX) {
      const oldest = Array.from(this.neighborCache.entries()).sort(
        (a, b) => a[1].lastSeenTime - b[1].lastSeenTime
      )[0][0];
      this.neighborCache.delete(oldest);
      console.log('[MESH] Evicted oldest neighbor:', oldest);
    }

    this.notifyNeighborListeners();
  }

  updatePhysicalNeighbor(deviceId: string, rssi?: number): void {
    // CRITICAL: Never register ourselves as a neighbor
    if (!deviceId || deviceId === this.deviceId) {
      console.log('[MESH] updatePhysicalNeighbor() — skipping self or invalid ID:', deviceId);
      return;
    }

    const isNew = !this.neighborCache.has(deviceId);
    this.neighborCache.set(deviceId, {
      src_id: deviceId,
      lastSeenTime: Date.now(),
      rssi,
    });
    console.log('[MESH] updatePhysicalNeighbor() —', isNew ? 'NEW' : 'UPDATE', '| deviceId:', deviceId, '| rssi:', rssi, '| cacheSize:', this.neighborCache.size);
    this.notifyNeighborListeners();

    // Trigger chat queue delivery for this peer if they have pending messages
    if (isNew) {
      try {
        getChatQueueService().processForPeer(deviceId);
      } catch (e) {
        // ChatQueueService may not be initialized yet during startup
        console.log('[MESH] ChatQueueService not ready yet');
      }
    }
  }

  getActiveNeighbors(): NeighborEntry[] {
    const now = Date.now();
    const active = Array.from(this.neighborCache.values()).filter(
      n => now - n.lastSeenTime < MESH_CONFIG.NEIGHBOR_EXPIRY
    );
    console.log('[MESH] getActiveNeighbors() — total:', this.neighborCache.size, '| active:', active.length);
    return active;
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
    const before = this.seenMessages.size;
    const now = Date.now();
    for (const [id, entry] of this.seenMessages) {
      if (now - entry.timestamp > MESH_CONFIG.SEEN_MESSAGE_TTL) {
        this.seenMessages.delete(id);
      }
    }
    const removed = before - this.seenMessages.size;
    if (removed > 0) console.log('[MESH] cleanSeenMessages() — removed:', removed, '| remaining:', this.seenMessages.size);
  }

  private cleanNeighborCache(): void {
    const now = Date.now();
    let changed = false;
    const removed: string[] = [];

    for (const [id, entry] of this.neighborCache) {
      if (now - entry.lastSeenTime > MESH_CONFIG.NEIGHBOR_EXPIRY) {
        this.neighborCache.delete(id);
        removed.push(id);
        changed = true;
      }
    }

    if (changed) {
      console.log('[MESH] cleanNeighborCache() — expired:', removed, '| remaining:', this.neighborCache.size);
      this.notifyNeighborListeners();
    }
  }

  private notifyNeighborListeners(): void {
    // THROTTLE: Only notify at most once per 500ms
    if (this.neighborNotifyPending) {
      return; // Already scheduled
    }

    this.neighborNotifyPending = true;

    if (this.neighborNotifyTimeout) {
      clearTimeout(this.neighborNotifyTimeout);
    }

    this.neighborNotifyTimeout = setTimeout(() => {
      try {
        this.neighborNotifyPending = false;
        const active = this.getActiveNeighbors();
        console.log('[MESH] notifyNeighborListeners() — active:', active.length, '| listeners:', this.neighborListeners.length);
        this.neighborListeners.forEach(cb => {
          try {
            cb(active);
          } catch (e) {
            console.error('[MESH] Listener callback error:', e);
          }
        });
      } catch (e) {
        console.error('[MESH] notifyNeighborListeners error:', e);
        this.neighborNotifyPending = false;
      }
    }, this.NEIGHBOR_NOTIFY_THROTTLE);
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
// ============================================================================
// CHAT QUEUE SERVICE
// Location: src/services/ChatQueueService.ts
// Purpose: Queue individual chat messages when recipient is offline,
//          auto-deliver when they come back in range
// ============================================================================

import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueuedChatMessage } from '../types';
import { generateUUID } from '../utils/helpers';

// Lazy import to avoid circular dependency
const getMeshProtocolService = () => require('./MeshProtocolService').default;

class ChatQueueService {
  private queue: QueuedChatMessage[] = [];
  private isProcessing: boolean = false;
  private listeners: Array<(queue: QueuedChatMessage[]) => void> = [];
  private processingInterval: ReturnType<typeof setInterval> | null = null;

  private readonly STORAGE_KEY = '@mesh_chat_queue';
  private readonly MAX_QUEUE_SIZE = 200;
  private readonly MAX_ATTEMPTS = 10;
  private readonly CHECK_INTERVAL = 5000; // Check every 5 seconds

  // =========================================================================
  // INITIALIZATION
  // =========================================================================
  async init(): Promise<void> {
    try {
      console.log('[CHAT_QUEUE] init() — loading queue from storage');
      await this.loadQueue();
      this.startProcessing();
      console.log('[CHAT_QUEUE] ChatQueueService initialized — queueSize:', this.queue.length);
    } catch (error) {
      console.error('[CHAT_QUEUE] Failed to initialize:', error);
    }
  }

  // =========================================================================
  // BACKGROUND PROCESSING
  // =========================================================================
  private startProcessing(): void {
    console.log('[CHAT_QUEUE] startProcessing() — interval:', this.CHECK_INTERVAL, 'ms');
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
    }

    this.processingInterval = setInterval(async () => {
      await this.processQueue();
    }, this.CHECK_INTERVAL);
  }

  stopProcessing(): void {
    console.log('[CHAT_QUEUE] stopProcessing()');
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }
  }

  // =========================================================================
  // QUEUE A CHAT MESSAGE
  // =========================================================================
  async queueMessage(destId: string, message: string): Promise<string> {
    console.log('[CHAT_QUEUE] queueMessage() — destId:', destId, '| msgLen:', message.length, '| currentQueueSize:', this.queue.length);

    const queuedMsg: QueuedChatMessage = {
      id: generateUUID(),
      destId,
      message,
      timestamp: Date.now(),
      attempts: 0,
      maxAttempts: this.MAX_ATTEMPTS,
      nextAttemptAt: Date.now(),
    };

    this.queue.push(queuedMsg);

    // Enforce max queue size - remove oldest messages first
    if (this.queue.length > this.MAX_QUEUE_SIZE) {
      const removed = this.queue.shift();
      console.log('[CHAT_QUEUE] Queue full — removed oldest:', removed?.id);
    }

    await this.saveQueue();
    this.notifyListeners();

    console.log('[CHAT_QUEUE] Message queued:', queuedMsg.id, '→', destId);
    return queuedMsg.id;
  }

  // =========================================================================
  // PROCESS QUEUE - DELIVER TO ONLINE PEERS
  // =========================================================================
  async processQueue(): Promise<void> {
    if (this.isProcessing || this.queue.length === 0) {
      return;
    }

    const MeshProtocolService = getMeshProtocolService();
    const activeNeighbors = MeshProtocolService.getActiveNeighbors();

    if (activeNeighbors.length === 0) {
      return;
    }

    // Get set of online peer IDs for fast lookup
    const onlinePeerIds = new Set(activeNeighbors.map((n: any) => n.src_id));

    const now = Date.now();

    // Find messages whose recipient is now online AND retry time has arrived
    const eligible = this.queue.filter(
      msg => onlinePeerIds.has(msg.destId) && msg.nextAttemptAt <= now
    );

    if (eligible.length === 0) {
      return;
    }

    console.log('[CHAT_QUEUE] processQueue() — queueSize:', this.queue.length, '| eligible:', eligible.length, '| onlinePeers:', onlinePeerIds.size);
    this.isProcessing = true;

    try {
      const toRemove: string[] = [];

      for (const queuedMsg of eligible) {
        try {
          // Send the message through MeshProtocolService
          await MeshProtocolService.sendChatMessage(queuedMsg.destId, queuedMsg.message);

          console.log('[CHAT_QUEUE] Delivered queued message:', queuedMsg.id, '→', queuedMsg.destId);
          toRemove.push(queuedMsg.id);

        } catch (error) {
          console.error('[CHAT_QUEUE] Failed to deliver:', queuedMsg.id, error);

          // Increment attempt counter with exponential backoff
          queuedMsg.attempts++;
          const backoff = Math.min(5000 * Math.pow(2, queuedMsg.attempts), 60000);
          queuedMsg.nextAttemptAt = Date.now() + backoff;

          console.log('[CHAT_QUEUE] Retry scheduled — id:', queuedMsg.id, '| attempt:', queuedMsg.attempts, '| backoff:', backoff, 'ms');

          if (queuedMsg.attempts >= queuedMsg.maxAttempts) {
            console.log('[CHAT_QUEUE] Max attempts reached — removing:', queuedMsg.id);
            toRemove.push(queuedMsg.id);
          }
        }
      }

      // Remove sent or failed messages
      if (toRemove.length > 0) {
        console.log('[CHAT_QUEUE] Removing', toRemove.length, 'items from queue');
        this.queue = this.queue.filter(msg => !toRemove.includes(msg.id));
        await this.saveQueue();
        this.notifyListeners();
      }

    } catch (error) {
      console.error('[CHAT_QUEUE] Error processing queue:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  // =========================================================================
  // MANUAL TRIGGER - When a specific peer comes online
  // =========================================================================
  async processForPeer(peerId: string): Promise<void> {
    if (!peerId) {
      console.warn('[CHAT_QUEUE] processForPeer() — invalid peerId');
      return;
    }

    const peerMessages = this.queue.filter(msg => msg.destId === peerId);
    if (peerMessages.length === 0) return;

    console.log('[CHAT_QUEUE] processForPeer() — peerId:', peerId, '| pending:', peerMessages.length);

    // Reset nextAttemptAt to now so they're eligible
    peerMessages.forEach(msg => {
      msg.nextAttemptAt = Date.now();
    });

    await this.processQueue();
  }

  // =========================================================================
  // GETTERS
  // =========================================================================
  getQueueSize(): number {
    return this.queue.length;
  }

  getQueue(): QueuedChatMessage[] {
    return [...this.queue];
  }

  getQueuedForPeer(peerId: string): QueuedChatMessage[] {
    return this.queue.filter(msg => msg.destId === peerId);
  }

  getPendingPeerIds(): string[] {
    return [...new Set(this.queue.map(msg => msg.destId))];
  }

  // =========================================================================
  // QUEUE MANAGEMENT
  // =========================================================================
  async clearQueue(): Promise<void> {
    this.queue = [];
    await this.saveQueue();
    this.notifyListeners();
    console.log('[CHAT_QUEUE] Queue cleared');
  }

  async clearQueueForPeer(peerId: string): Promise<void> {
    const before = this.queue.length;
    this.queue = this.queue.filter(msg => msg.destId !== peerId);
    await this.saveQueue();
    this.notifyListeners();
    console.log('[CHAT_QUEUE] Cleared', before - this.queue.length, 'messages for peer:', peerId);
  }

  async removeMessage(id: string): Promise<void> {
    this.queue = this.queue.filter(msg => msg.id !== id);
    await this.saveQueue();
    this.notifyListeners();
  }

  // =========================================================================
  // PERSISTENCE
  // =========================================================================
  private async saveQueue(): Promise<void> {
    try {
      await AsyncStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.queue));
    } catch (error) {
      console.error('[CHAT_QUEUE] Failed to save queue:', error);
    }
  }

  private async loadQueue(): Promise<void> {
    try {
      const data = await AsyncStorage.getItem(this.STORAGE_KEY);
      if (data) {
        this.queue = JSON.parse(data);
        console.log('[CHAT_QUEUE] Loaded', this.queue.length, 'queued messages');
      }
    } catch (error) {
      console.error('[CHAT_QUEUE] Failed to load queue:', error);
      this.queue = [];
    }
  }

  // =========================================================================
  // SUBSCRIPTIONS
  // =========================================================================
  onQueueChange(callback: (queue: QueuedChatMessage[]) => void): () => void {
    this.listeners.push(callback);
    callback([...this.queue]); // Immediately call with current state
    return () => {
      this.listeners = this.listeners.filter(cb => cb !== callback);
    };
  }

  private notifyListeners(): void {
    const queueCopy = [...this.queue];
    this.listeners.forEach(listener => listener(queueCopy));
  }
}

export default new ChatQueueService();

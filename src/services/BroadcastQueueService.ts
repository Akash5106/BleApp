// ============================================================================
// BROADCAST QUEUE SERVICE
// Location: src/services/BroadcastQueueService.ts
// Purpose: Queue broadcasts when offline, deliver when peers appear (Bridgefy-style)
// ============================================================================

import AsyncStorage from '@react-native-async-storage/async-storage';
import MeshProtocolService from './MeshProtocolService';
import { generateUUID } from '../utils/helpers';
import { QueuedBroadcast } from '../types';

class BroadcastQueueService {
  private queue: QueuedBroadcast[] = [];
  private isProcessing: boolean = false;
  private listeners: Array<(count: number) => void> = [];
  private processingInterval: ReturnType<typeof setInterval> | null = null;
  private readonly STORAGE_KEY = '@mesh_broadcast_queue';
  private readonly MAX_QUEUE_SIZE = 100;
  private readonly MAX_ATTEMPTS = 5;
  private readonly CHECK_INTERVAL = 5000; // Check every 5 seconds

  /**
   * Initialize the queue service
   */
  async init(): Promise<void> {
    try {
      await this.loadQueue();
      this.startProcessing();
      console.log('✅ BroadcastQueueService initialized');
    } catch (error) {
      console.error('❌ Failed to initialize BroadcastQueueService:', error);
    }
  }

  /**
   * Start background processing
   */
  private startProcessing(): void {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
    }

    this.processingInterval = setInterval(async () => {
      await this.processQueue();
    }, this.CHECK_INTERVAL);
  }

  /**
   * Stop background processing
   */
  stopProcessing(): void {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }
  }

  /**
   * Add a broadcast to the queue
   */
  async queueBroadcast(message: string, isEmergency: boolean = false): Promise<string> {
    const broadcast: QueuedBroadcast = {
      id: generateUUID(),
      message,
      isEmergency,
      timestamp: Date.now(),
      attempts: 0,
      maxAttempts: isEmergency ? this.MAX_ATTEMPTS * 2 : this.MAX_ATTEMPTS,
      nextAttemptAt: Date.now(),
    };

    this.queue.push(broadcast);

    // Enforce max queue size
    if (this.queue.length > this.MAX_QUEUE_SIZE) {
      // Remove oldest non-emergency messages first
      const normalIndex = this.queue.findIndex(b => !b.isEmergency);
      if (normalIndex !== -1) {
        this.queue.splice(normalIndex, 1);
      } else {
        // If all are emergency, remove oldest
        this.queue.shift();
      }
    }

    await this.saveQueue();
    this.notifyListeners();

    console.log(`📦 Queued broadcast: ${broadcast.id} (emergency: ${isEmergency})`);
    
    return broadcast.id;
  }

  /**
   * Process the queue - send messages when peers are available
   */
  async processQueue(): Promise<void> {
    if (this.isProcessing || this.queue.length === 0) {
      return;
    }

    // Check if there are active neighbors
    const activeNeighbors = MeshProtocolService.getActiveNeighbors();
    if (activeNeighbors.length === 0) {
      return;
    }
    const now = Date.now();

    // ⭐ Only process messages whose retry time has arrived
    const eligible = this.queue.filter(b => b.nextAttemptAt <= now);
    if (eligible.length === 0) {
      return;
    }

    this.isProcessing = true;

    try {
      const toRemove: string[] = [];

      // Process emergency messages first
      const sortedQueue = [...this.queue].sort((a, b) => {
        if (a.isEmergency && !b.isEmergency) return -1;
        if (!a.isEmergency && b.isEmergency) return 1;
        return a.timestamp - b.timestamp;
      });

      for (const broadcast of sortedQueue) {
        try {
          // Try to send the broadcast
          await MeshProtocolService.sendBroadcastMessage(
            broadcast.message,
            broadcast.isEmergency
          );

          console.log(`✅ Sent queued broadcast: ${broadcast.id}`);
          toRemove.push(broadcast.id);

        } catch (error) {
          console.error(`❌ Failed to send queued broadcast ${broadcast.id}:`, error);
          
          // Increment attempt counter
          broadcast.attempts++;
          const baseDelay = broadcast.isEmergency ? 2000 : 5000;
          const backoff = Math.min(
            baseDelay * Math.pow(2, broadcast.attempts),
            60_000 // cap at 1 minute
          );
          broadcast.nextAttemptAt = Date.now()+backoff;
          console.error(
            `❌ Failed broadcast ${broadcast.id}, retry in ${backoff}ms`
          );
          if (broadcast.attempts >= broadcast.maxAttempts) {
            console.log(`❌ Max attempts reached for broadcast ${broadcast.id}, removing from queue`);
            toRemove.push(broadcast.id);
          }
        }
      }

      // Remove sent or failed messages
      if (toRemove.length > 0) {
        this.queue = this.queue.filter(b => !toRemove.includes(b.id));
        await this.saveQueue();
        this.notifyListeners();
      }

    } catch (error) {
      console.error('❌ Error processing queue:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Get queue size
   */
  async getQueueSize(): Promise<number> {
    return this.queue.length;
  }

  /**
   * Get queued messages
   */
  getQueue(): QueuedBroadcast[] {
    return [...this.queue];
  }

  /**
   * Clear entire queue
   */
  async clearQueue(): Promise<void> {
    this.queue = [];
    await this.saveQueue();
    this.notifyListeners();
    console.log('🧹 Cleared broadcast queue');
  }

  /**
   * Remove specific broadcast from queue
   */
  async removeBroadcast(id: string): Promise<void> {
    this.queue = this.queue.filter(b => b.id !== id);
    await this.saveQueue();
    this.notifyListeners();
  }

  /**
   * Save queue to AsyncStorage
   */
  private async saveQueue(): Promise<void> {
    try {
      await AsyncStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.queue));
    } catch (error) {
      console.error('❌ Failed to save queue:', error);
    }
  }

  /**
   * Load queue from AsyncStorage
   */
  private async loadQueue(): Promise<void> {
    try {
      const data = await AsyncStorage.getItem(this.STORAGE_KEY);
      if (data) {
        this.queue = JSON.parse(data);
        console.log(`📦 Loaded ${this.queue.length} queued broadcasts`);
      }
    } catch (error) {
      console.error('❌ Failed to load queue:', error);
      this.queue = [];
    }
  }

  /**
   * Subscribe to queue changes
   */
  onQueueChange(callback: (count: number) => void): () => void {
    this.listeners.push(callback);
    
    // Immediately call with current count
    callback(this.queue.length);

    return () => {
      this.listeners = this.listeners.filter(cb => cb !== callback);
    };
  }

  /**
   * Notify all listeners of queue change
   */
  private notifyListeners(): void {
    const count = this.queue.length;
    this.listeners.forEach(listener => listener(count));
  }

  /**
   * Get queue statistics
   */
  getStats(): {
    total: number;
    emergency: number;
    normal: number;
    oldest: number | null;
  } {
    const emergency = this.queue.filter(b => b.isEmergency).length;
    const normal = this.queue.length - emergency;
    const oldest = this.queue.length > 0 
      ? Math.min(...this.queue.map(b => b.timestamp))
      : null;

    return {
      total: this.queue.length,
      emergency,
      normal,
      oldest,
    };
  }
}

export default new BroadcastQueueService();
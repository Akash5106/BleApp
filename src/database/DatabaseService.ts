// ============================================================================
// DATABASE SERVICE
// Location: src/database/DatabaseService.ts
// Purpose: SQLite database management for message persistence
// ============================================================================

import SQLite from 'react-native-sqlite-storage';
import { StoredMessage, MessageState } from '../types';
import { MESH_CONFIG } from '../constants';

SQLite.enablePromise(true);

class DatabaseService {
  private db: SQLite.SQLiteDatabase | null = null;

  /**
   * Initialize SQLite database
   */
  async init(): Promise<void> {
    try {
      console.log('[DB] init() — opening database:', MESH_CONFIG.DB_NAME);
      this.db = await SQLite.openDatabase({
        name: MESH_CONFIG.DB_NAME,
        location: 'default',
      });

      await this.createTables();
      console.log('[DB] Database initialized successfully');
    } catch (error) {
      console.error('[DB] Database init failed:', error);
      throw error;
    }
  }

  /**
   * Create messages table with indexes
   */
  private async createTables(): Promise<void> {
  console.log('[DB] createTables() — creating messages table + indexes');
  if (!this.db) return;

  await this.db.executeSql(`
    CREATE TABLE IF NOT EXISTS messages (
      msg_id TEXT PRIMARY KEY,
      src_id TEXT NOT NULL,
      dest_id TEXT NOT NULL,
      flags INTEGER NOT NULL,
      payload TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      ui_state TEXT NOT NULL
    )
  `);

  await this.db.executeSql(
    `CREATE INDEX IF NOT EXISTS idx_timestamp ON messages(timestamp)`
  );

  await this.db.executeSql(
    `CREATE INDEX IF NOT EXISTS idx_dest_id ON messages(dest_id)`
  );

  await this.db.executeSql(
    `CREATE INDEX IF NOT EXISTS idx_src_id ON messages(src_id)`
  );
}

  /**
   * Save a message to database
   */
  async saveMessage(message: StoredMessage): Promise<void> {
    const query = `
      INSERT OR REPLACE INTO messages
      (msg_id, src_id, dest_id, flags, payload, timestamp, ui_state)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;

    try {
      console.log('[DB] saveMessage() — msg_id:', message.msg_id, '| src:', message.src_id, '| dest:', message.dest_id);
      await this.db?.executeSql(query, [
        message.msg_id,
        message.src_id,
        message.dest_id,
        message.flags,
        message.payload,
        message.timestamp,
        message.ui_state,
      ]);
      console.log('[DB] Message saved:', message.msg_id);
    } catch (error) {
      console.error('[DB] Failed to save message:', error);
      throw error;
    }
  }

  /**
   * Get all messages for a specific destination (chat history + broadcasts)
   */
  async getMessages(destId: string): Promise<StoredMessage[]> {
    console.log('[DB] getMessages() — destId:', destId);
    const query = `
      SELECT * FROM messages
      WHERE dest_id = ? OR dest_id = ?
      ORDER BY timestamp ASC
    `;

    try {
      const [results] = await this.db!.executeSql(query, [
        destId,
        MESH_CONFIG.BROADCAST_ADDRESS,
      ]);

      const messages: StoredMessage[] = [];
      for (let i = 0; i < results.rows.length; i++) {
        messages.push(results.rows.item(i));
      }

      console.log('[DB] getMessages() returned', messages.length, 'messages');
      return messages;
    } catch (error) {
      console.error('[DB] Failed to get messages:', error);
      return [];
    }
  }

  /**
   * Get messages between two devices (chat conversation)
   */
  async getChatMessages(
    deviceId1: string,
    deviceId2: string
  ): Promise<StoredMessage[]> {
    console.log('[DB] getChatMessages() — between:', deviceId1, 'and', deviceId2);
    const query = `
      SELECT * FROM messages
      WHERE (src_id = ? AND dest_id = ?)
         OR (src_id = ? AND dest_id = ?)
      ORDER BY timestamp ASC
    `;

    try {
      const [results] = await this.db!.executeSql(query, [
        deviceId1,
        deviceId2,
        deviceId2,
        deviceId1,
      ]);

      const messages: StoredMessage[] = [];
      for (let i = 0; i < results.rows.length; i++) {
        messages.push(results.rows.item(i));
      }

      console.log('[DB] getChatMessages() returned', messages.length, 'messages');
      return messages;
    } catch (error) {
      console.error('[DB] Failed to get chat messages:', error);
      return [];
    }
  }

  /**
   * Get broadcast messages
   */
  async getBroadcastMessages(): Promise<StoredMessage[]> {
    console.log('[DB] getBroadcastMessages()');
    const query = `
      SELECT * FROM messages
      WHERE dest_id = ?
      ORDER BY timestamp DESC
      LIMIT 100
    `;

    try {
      const [results] = await this.db!.executeSql(query, [
        MESH_CONFIG.BROADCAST_ADDRESS,
      ]);

      const messages: StoredMessage[] = [];
      for (let i = 0; i < results.rows.length; i++) {
        messages.push(results.rows.item(i));
      }

      console.log('[DB] getBroadcastMessages() returned', messages.length, 'broadcasts');
      return messages;
    } catch (error) {
      console.error('[DB] Failed to get broadcast messages:', error);
      return [];
    }
  }

  /**
   * Update message state (SENDING → MAYBE → CONFIRMED)
   */
  async updateMessageState(
    msgId: string,
    state: MessageState
  ): Promise<void> {
    const query = `UPDATE messages SET ui_state = ? WHERE msg_id = ?`;

    try {
      console.log('[DB] updateMessageState() — msgId:', msgId, '| newState:', state);
      await this.db?.executeSql(query, [state, msgId]);
    } catch (error) {
      console.error('[DB] Failed to update message state:', error);
    }
  }

  /**
   * Delete old messages (keep last N days)
   */
  async cleanOldMessages(
    daysToKeep: number = MESH_CONFIG.MESSAGE_RETENTION_DAYS
  ): Promise<void> {
    const cutoffTime =
      Date.now() - daysToKeep * 24 * 60 * 60 * 1000;

    const query = `DELETE FROM messages WHERE timestamp < ?`;

    try {
      console.log('[DB] cleanOldMessages() — cutoff:', new Date(cutoffTime).toISOString());
      await this.db?.executeSql(query, [cutoffTime]);
      console.log('[DB] Cleaned old messages');
    } catch (error) {
      console.error('[DB] Failed to clean old messages:', error);
    }
  }

  /**
   * Get message count
   */
  async getMessageCount(): Promise<number> {
    const query = `SELECT COUNT(*) as count FROM messages`;

    try {
      const [results] = await this.db!.executeSql(query);
      const count = results.rows.item(0).count;
      console.log('[DB] getMessageCount():', count);
      return count;
    } catch (error) {
      console.error('[DB] Failed to get message count:', error);
      return 0;
    }
  }

  /**
   * Delete all messages
   */
  async clearAllMessages(): Promise<void> {
    const query = `DELETE FROM messages`;

    try {
      await this.db?.executeSql(query);
      console.log('[DB] Cleared all messages');
    } catch (error) {
      console.error('[DB] Failed to clear messages:', error);
    }
  }

  /**
   * Close database connection
   */
  async close(): Promise<void> {
    try {
      await this.db?.close();
      this.db = null;
      console.log('[DB] Database closed');
    } catch (error) {
      console.error('[DB] Failed to close database:', error);
    }
  }
}

export default new DatabaseService();
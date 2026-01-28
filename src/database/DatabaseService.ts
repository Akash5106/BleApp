// ============================================================================
// DATABASE SERVICE
// Location: src/database/DatabaseService.ts
// Purpose: SQLite database management for message persistence
// ============================================================================

import SQLite from 'react-native-sqlite-storage';
import { StoredMessage, MessageState } from '../types';

SQLite.enablePromise(true);

class DatabaseService {
  private db: SQLite.SQLiteDatabase | null = null;

  /**
   * Initialize SQLite database
   */
  async init(): Promise<void> {
    try {
      this.db = await SQLite.openDatabase({
        name: 'mesh_messages.db',
        location: 'default',
      });

      await this.createTables();
      console.log('✅ Database initialized');
    } catch (error) {
      console.error('❌ Database init failed:', error);
      throw error;
    }
  }

  /**
   * Create messages table with indexes
   */
  private async createTables(): Promise<void> {
    const createMessagesTable = `
      CREATE TABLE IF NOT EXISTS messages (
        msg_id TEXT PRIMARY KEY,
        src_id TEXT NOT NULL,
        dest_id TEXT NOT NULL,
        flags INTEGER NOT NULL,
        payload TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        ui_state TEXT NOT NULL
      );
      
      CREATE INDEX IF NOT EXISTS idx_timestamp ON messages(timestamp);
      CREATE INDEX IF NOT EXISTS idx_dest_id ON messages(dest_id);
      CREATE INDEX IF NOT EXISTS idx_src_id ON messages(src_id);
    `;

    await this.db?.executeSql(createMessagesTable);
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
      await this.db?.executeSql(query, [
        message.msg_id,
        message.src_id,
        message.dest_id,
        message.flags,
        message.payload,
        message.timestamp,
        message.ui_state,
      ]);
    } catch (error) {
      console.error('❌ Failed to save message:', error);
      throw error;
    }
  }

  /**
   * Get all messages for a specific destination (chat history)
   */
  async getMessages(destId: string): Promise<StoredMessage[]> {
    const query = `
      SELECT * FROM messages 
      WHERE dest_id = ? OR dest_id = '0xFFFF'
      ORDER BY timestamp ASC
    `;

    try {
      const [results] = await this.db!.executeSql(query, [destId]);
      const messages: StoredMessage[] = [];

      for (let i = 0; i < results.rows.length; i++) {
        messages.push(results.rows.item(i));
      }

      return messages;
    } catch (error) {
      console.error('❌ Failed to get messages:', error);
      return [];
    }
  }

  /**
   * Get messages between two devices (chat conversation)
   */
  async getChatMessages(deviceId1: string, deviceId2: string): Promise<StoredMessage[]> {
    const query = `
      SELECT * FROM messages 
      WHERE (src_id = ? AND dest_id = ?) 
         OR (src_id = ? AND dest_id = ?)
      ORDER BY timestamp ASC
    `;

    try {
      const [results] = await this.db!.executeSql(query, [
        deviceId1, deviceId2,
        deviceId2, deviceId1,
      ]);
      const messages: StoredMessage[] = [];

      for (let i = 0; i < results.rows.length; i++) {
        messages.push(results.rows.item(i));
      }

      return messages;
    } catch (error) {
      console.error('❌ Failed to get chat messages:', error);
      return [];
    }
  }

  /**
   * Get broadcast messages
   */
  async getBroadcastMessages(): Promise<StoredMessage[]> {
    const query = `
      SELECT * FROM messages 
      WHERE dest_id = '0xFFFF'
      ORDER BY timestamp DESC
      LIMIT 100
    `;

    try {
      const [results] = await this.db!.executeSql(query);
      const messages: StoredMessage[] = [];

      for (let i = 0; i < results.rows.length; i++) {
        messages.push(results.rows.item(i));
      }

      return messages;
    } catch (error) {
      console.error('❌ Failed to get broadcast messages:', error);
      return [];
    }
  }

  /**
   * Update message state (SENDING → MAYBE → CONFIRMED)
   */
  async updateMessageState(msgId: string, state: MessageState): Promise<void> {
    const query = `UPDATE messages SET ui_state = ? WHERE msg_id = ?`;
    
    try {
      await this.db?.executeSql(query, [state, msgId]);
    } catch (error) {
      console.error('❌ Failed to update message state:', error);
    }
  }

  /**
   * Delete old messages (keep last N days)
   */
  async cleanOldMessages(daysToKeep: number = 7): Promise<void> {
    const cutoffTime = Date.now() - daysToKeep * 24 * 60 * 60 * 1000;
    const query = `DELETE FROM messages WHERE timestamp < ?`;
    
    try {
      await this.db?.executeSql(query, [cutoffTime]);
      console.log('🧹 Cleaned old messages');
    } catch (error) {
      console.error('❌ Failed to clean old messages:', error);
    }
  }

  /**
   * Get message count
   */
  async getMessageCount(): Promise<number> {
    const query = `SELECT COUNT(*) as count FROM messages`;
    
    try {
      const [results] = await this.db!.executeSql(query);
      return results.rows.item(0).count;
    } catch (error) {
      console.error('❌ Failed to get message count:', error);
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
      console.log('🧹 Cleared all messages');
    } catch (error) {
      console.error('❌ Failed to clear messages:', error);
    }
  }

  /**
   * Close database connection
   */
  async close(): Promise<void> {
    try {
      await this.db?.close();
      this.db = null;
      console.log('✅ Database closed');
    } catch (error) {
      console.error('❌ Failed to close database:', error);
    }
  }
}

export default new DatabaseService();
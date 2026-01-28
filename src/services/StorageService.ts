// ============================================================================
// STORAGE SERVICE
// Handles AsyncStorage for lightweight preferences
// ============================================================================

import AsyncStorage from '@react-native-async-storage/async-storage';
import { UserSettings } from '../types';

// ---------------------------------------------------------------------------
// Storage Keys (single source of truth)
// ---------------------------------------------------------------------------
const KEYS = {
  USER_SETTINGS: '@mesh_user_settings',
};

// ============================================================================
// STORAGE SERVICE
// ============================================================================
class StorageService {
  // -------------------------------------------------------------------------
  // DEVICE ID
  // -------------------------------------------------------------------------

  /**
   * Generate a short unique device ID (2 bytes → 0xABCD)
   * NOTE: collision is acceptable for mesh (handled at protocol layer)
   */
  generateDeviceId(): string {
    const random = Math.floor(Math.random() * 0xffff);
    return `0x${random.toString(16).padStart(4, '0').toUpperCase()}`;
  }

  // -------------------------------------------------------------------------
  // INITIALIZATION
  // -------------------------------------------------------------------------

  /**
   * Initialize user settings if not present
   */
  async initUserSettings(): Promise<UserSettings> {
    let settings = await this.getUserSettings();

    if (!settings) {
      settings = {
        device_id: this.generateDeviceId(),
        username: `User-${Math.floor(Math.random() * 10000)}`,
        encryptionEnabled: false,
      };

      await this.saveUserSettings(settings);
      console.log('✅ Created user settings:', settings.device_id);
    }

    return settings;
  }

  // -------------------------------------------------------------------------
  // READ / WRITE
  // -------------------------------------------------------------------------

  /**
   * Get user settings
   */
  async getUserSettings(): Promise<UserSettings | null> {
    try {
      const data = await AsyncStorage.getItem(KEYS.USER_SETTINGS);
      return data ? (JSON.parse(data) as UserSettings) : null;
    } catch (error) {
      console.error('❌ Failed to get user settings:', error);
      return null;
    }
  }

  /**
   * Save user settings
   */
  async saveUserSettings(settings: UserSettings): Promise<void> {
    try {
      await AsyncStorage.setItem(
        KEYS.USER_SETTINGS,
        JSON.stringify(settings)
      );
    } catch (error) {
      console.error('❌ Failed to save user settings:', error);
    }
  }

  // -------------------------------------------------------------------------
  // UPDATES
  // -------------------------------------------------------------------------

  /**
   * Update username
   */
  async updateUsername(username: string): Promise<void> {
    const settings = await this.getUserSettings();
    if (!settings) return;

    settings.username = username;
    await this.saveUserSettings(settings);
  }

  /**
   * Get device ID (always returns one)
   */
  async getDeviceId(): Promise<string> {
    const settings = await this.getUserSettings();
    return settings?.device_id ?? this.generateDeviceId();
  }

  // -------------------------------------------------------------------------
  // MAINTENANCE
  // -------------------------------------------------------------------------

  /**
   * Clear all stored data
   */
  async clearAll(): Promise<void> {
    try {
      await AsyncStorage.clear();
      console.log('🧹 Storage cleared');
    } catch (error) {
      console.error('❌ Failed to clear storage:', error);
    }
  }
}

// Export singleton
export default new StorageService();
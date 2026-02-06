// ============================================================================
// STORAGE SERVICE
// Handles AsyncStorage for lightweight preferences
// ============================================================================

import AsyncStorage from '@react-native-async-storage/async-storage';
import { UserSettings } from '../types';
import { generateDeviceId } from '../utils/helpers';

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
  // INITIALIZATION
  // -------------------------------------------------------------------------

  /**
   * Initialize user settings if not present
   */
  async initUserSettings(): Promise<UserSettings> {
    console.log('[STORAGE] initUserSettings() — checking for existing settings');
    let settings = await this.getUserSettings();

    if (!settings) {
      settings = {
        device_id: generateDeviceId(),
        username: `User-${Math.floor(Math.random() * 10000)}`,
        encryptionEnabled: false,
      };

      await this.saveUserSettings(settings);
      console.log('[STORAGE] Created new user settings — device_id:', settings.device_id, '| username:', settings.username);
    } else {
      console.log('[STORAGE] Existing settings found — device_id:', settings.device_id);
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
      const settings = data ? (JSON.parse(data) as UserSettings) : null;
      console.log('[STORAGE] getUserSettings() —', settings ? 'found' : 'not found');
      return settings;
    } catch (error) {
      console.error('[STORAGE] Failed to get user settings:', error);
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
      console.log('[STORAGE] saveUserSettings() — saved for device_id:', settings.device_id);
    } catch (error) {
      console.error('[STORAGE] Failed to save user settings:', error);
    }
  }

  // -------------------------------------------------------------------------
  // UPDATES
  // -------------------------------------------------------------------------

  /**
   * Update username
   */
  async updateUsername(username: string): Promise<void> {
    console.log('[STORAGE] updateUsername() — new username:', username);
    const settings = await this.getUserSettings();
    if (!settings) {
      console.warn('[STORAGE] updateUsername() — no settings found, skipping');
      return;
    }

    settings.username = username;
    await this.saveUserSettings(settings);
    console.log('[STORAGE] Username updated successfully');
  }

  /**
   * Get device ID (always returns one)
   */
  async getDeviceId(): Promise<string> {
    const settings = await this.getUserSettings();
    if (!settings) {
      console.error('[STORAGE] getDeviceId() — storage not initialized!');
      throw new Error("Storage not initialized");
    }
    console.log('[STORAGE] getDeviceId() —', settings.device_id);
    return settings.device_id;
  }

  // -------------------------------------------------------------------------
  // MAINTENANCE
  // -------------------------------------------------------------------------

  /**
   * Clear all stored data
   */
  async clearAll(): Promise<void> {
    try {
      console.log('[STORAGE] clearAll() — clearing AsyncStorage');
      await AsyncStorage.clear();
      console.log('[STORAGE] Storage cleared successfully');
    } catch (error) {
      console.error('[STORAGE] Failed to clear storage:', error);
    }
  }
}
export const STORAGE_KEYS = KEYS;
// Export singleton
export default new StorageService();
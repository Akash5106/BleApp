// ============================================================================
// CONSTANTS
// Location: src/constant/index.ts
// Purpose: All app-wide configuration and constants
// ============================================================================

export const MESH_CONFIG = {
  // Bluetooth UUIDs
  SERVICE_UUID: '0000FFF0-0000-1000-8000-00805F9B34FB',
  CHARACTERISTIC_UUID: '0000FFF1-0000-1000-8000-00805F9B34FB',
  
  // Protocol settings
  SEEN_MESSAGES_MAX: 1000,              // Max entries in LRU cache
  SEEN_MESSAGE_TTL: 60000,              // 60 seconds
  NEIGHBOR_CACHE_MAX: 100,              // Max neighbors to track
  NEIGHBOR_EXPIRY: 30000,               // 30 seconds
  NEIGHBOR_ACTIVE_THRESHOLD: 30000,     // Match NEIGHBOR_EXPIRY for "active" status
  
  // Forwarding settings
  FORWARDING_JITTER_MIN: 50,            // ms
  FORWARDING_JITTER_MAX: 200,           // ms
  REDUNDANCY_COUNT: 3,                  // Send packet 3 times
  
  // TTL settings (hop count)
  BASE_TTL_CHAT: 2,                     // Chat messages
  BASE_TTL_BROADCAST: 5,                // Broadcast messages
  MAX_TTL: 10,                          // Maximum TTL
  ADAPTIVE_TTL_THRESHOLD: 3,            // Neighbor count for adaptation
  
  // Scanning settings
  SCAN_DURATION: 10000,                  // 10 seconds
  SCAN_ALLOW_DUPLICATES: false,          // CRITICAL: false prevents JS bridge overload
  SCAN_WINDOW: 4000,
  ADVERTISE_WINDOW: 2000,
  
  // Database settings
  MESSAGE_RETENTION_DAYS: 7,            // Keep messages for 7 days
  DB_NAME: 'mesh_messages.db',
  
  // Storage keys (AsyncStorage)
  STORAGE_KEYS: {
    USER_PROFILE: '@mesh_user_profile',
    DEVICE_ID: '@mesh_device_id',
    SETTINGS: '@mesh_settings',
  },
  
  // Broadcast address
  BROADCAST_ADDRESS: '0xFFFF',
  
  // Cleanup intervals
  CLEANUP_INTERVAL_SEEN: 30000,         // 30 seconds
  CLEANUP_INTERVAL_NEIGHBORS: 10000,    // 10 seconds
} as const;

export const COLORS = {
  primary: '#4A90E2',
  secondary: '#50C878',
  danger: '#FF5252',
  warning: '#FFA726',
  background: '#F5F5F5',
  surface: '#FFFFFF',
  text: '#333333',
  textLight: '#666666',
  textLighter: '#999999',
  border: '#E0E0E0',
  success: '#4CAF50',
  info: '#2196F3',
} as const;

export const SCREEN_NAMES = {
  NEARBY_PEERS: 'NearbyPeers',
  CHAT: 'Chat',
  BROADCAST: 'Broadcast',
  SETTINGS: 'Settings',
} as const;

export const ERROR_MESSAGES = {
  BLUETOOTH_DISABLED: 'Bluetooth is disabled. Please enable it to use this app.',
  PERMISSIONS_DENIED: 'Bluetooth permissions are required for this app to work.',
  CONNECTION_FAILED: 'Failed to connect to device.',
  MESSAGE_SEND_FAILED: 'Failed to send message. Please try again.',
  INITIALIZATION_FAILED: 'Failed to initialize app. Please restart.',
  DATABASE_ERROR: 'Database error occurred.',
  NETWORK_ERROR: 'Network error. Check your Bluetooth connection.',
  PERMISSIONS_REQUIRED_TITLE: 'Permissions Required',
  PERMISSIONS_REQUIRED_DESC:'This app needs Bluetooth and Location permissions to discover nearby devices.',
  ENABLE_BLUETOOTH_TITLE: 'Enable Bluetooth',
  ENABLE_BLUETOOTH_DESC:'Please enable Bluetooth in your device settings to continue.',
} as const;
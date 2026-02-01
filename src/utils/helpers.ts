// ============================================================================
// HELPER UTILITIES
// Location: src/utils/helpers.ts
// Purpose: Common utility functions used throughout the app
// ============================================================================

import { MESH_CONFIG } from '../constants';

// ============================================================================
// ID GENERATION
// ============================================================================

/**
 * Generate a unique device ID (short 2-4 byte format)
 */
export const generateDeviceId = (): string => {
  const random = Math.floor(Math.random() * 65536);
  return `0x${random.toString(16).padStart(4, '0').toUpperCase()}`;
};

/**
 * Generate a UUID v4
 */
export const generateUUID = (): string => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

// ============================================================================
// TIME FORMATTING
// ============================================================================

/**
 * Format timestamp to readable string
 */
export const formatTimestamp = (timestamp: number): string => {
  const date = new Date(timestamp);
  const now = new Date();
  
  const isToday = date.toDateString() === now.toDateString();
  
  if (isToday) {
    return date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  }
  
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();
  
  if (isYesterday) {
    return 'Yesterday';
  }
  
  return date.toLocaleDateString('en-US', { 
    month: 'short', 
    day: 'numeric' 
  });
};

/**
 * Format "last seen" time (e.g., "5s ago", "2m ago")
 */
export const formatLastSeen = (timestamp: number): string => {
  const secondsAgo = Math.floor((Date.now() - timestamp) / 1000);
  
  if (secondsAgo < 5) {
    return 'Active now';
  }
  
  if (secondsAgo < 60) {
    return `${secondsAgo}s ago`;
  }
  
  const minutesAgo = Math.floor(secondsAgo / 60);
  if (minutesAgo < 60) {
    return `${minutesAgo}m ago`;
  }
  
  const hoursAgo = Math.floor(minutesAgo / 60);
  if (hoursAgo < 24) {
    return `${hoursAgo}h ago`;
  }
  
  const daysAgo = Math.floor(hoursAgo / 24);
  return `${daysAgo}d ago`;
};

/**
 * Format duration in milliseconds to human readable
 */
export const formatDuration = (ms: number): string => {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
};

// ============================================================================
// MESH PROTOCOL HELPERS
// ============================================================================

/**
 * Get random delay for jittered forwarding
 */
export const getJitteredDelay = (): number => {
  const { FORWARDING_JITTER_MIN, FORWARDING_JITTER_MAX } = MESH_CONFIG;
  return Math.random() * (FORWARDING_JITTER_MAX - FORWARDING_JITTER_MIN) + FORWARDING_JITTER_MIN;
};

/**
 * Calculate adaptive TTL based on neighbor count
 */
export const calculateAdaptiveTTL = (
  neighborCount: number,
  messageType: 'chat' | 'broadcast'
): number => {
  if (messageType === 'broadcast') {
    return MESH_CONFIG.BASE_TTL_BROADCAST;
  }
  
  // Adaptive TTL for chat messages
  if (neighborCount >= MESH_CONFIG.ADAPTIVE_TTL_THRESHOLD) {
    return MESH_CONFIG.BASE_TTL_CHAT;
  }
  
  return MESH_CONFIG.BASE_TTL_CHAT + 1;
};

/**
 * Check if device is active (last seen within threshold)
 */
export const isDeviceActive = (lastSeen: number): boolean => {
  return Date.now() - lastSeen < MESH_CONFIG.NEIGHBOR_ACTIVE_THRESHOLD;
};

// ============================================================================
// DATA CONVERSION
// ============================================================================

/**
 * Convert string to byte array
 */
export const stringToBytes = (str: string): number[] => {
  const bytes: number[] = [];
  for (let i = 0; i < str.length; i++) {
    bytes.push(str.charCodeAt(i));
  }
  return bytes;
};

/**
 * Convert byte array to string
 */
export const bytesToString = (bytes: number[]): string => {
  return String.fromCharCode(...bytes);
};

/**
 * Convert bytes to hex string
 */
export const bytesToHex = (bytes: number[]): string => {
  return bytes.map(b => b.toString(16).padStart(2, '0')).join('');
};

/**
 * Convert hex string to bytes
 */
export const hexToBytes = (hex: string): number[] => {
  const bytes: number[] = [];
  for (let i = 0; i < hex.length; i += 2) {
    bytes.push(parseInt(hex.substr(i, 2), 16));
  }
  return bytes;
};

// ============================================================================
// STRING UTILITIES
// ============================================================================

/**
 * Truncate string to max length
 */
export const truncateString = (str: string, maxLength: number): string => {
  if (str.length <= maxLength) {
    return str;
  }
  return str.substring(0, maxLength - 3) + '...';
};

/**
 * Capitalize first letter
 */
export const capitalize = (str: string): string => {
  return str.charAt(0).toUpperCase() + str.slice(1);
};

/**
 * Generate random alphanumeric string
 */
export const randomString = (length: number): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

// ============================================================================
// ASYNC UTILITIES
// ============================================================================

/**
 * Sleep/delay function
 */
export const sleep = (ms: number): Promise<void> => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

/**
 * Retry function with exponential backoff
 */
export const retry = async <T>(
  fn: () => Promise<T>,
  maxAttempts: number = 3,
  delay: number = 1000
): Promise<T> => {
  let lastError: Error;
  
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      if (attempt < maxAttempts - 1) {
        await sleep(delay * Math.pow(2, attempt));
      }
    }
  }
  
  throw lastError!;
};

/**
 * Debounce function
 */
export const debounce = <T extends (...args: any[]) => any>(
  func: T,
  wait: number
): ((...args: Parameters<T>) => void) => {
 let timeout: ReturnType<typeof setTimeout> | null = null;
  
  return (...args: Parameters<T>) => {
    if (timeout) {
      clearTimeout(timeout);
    }
    
    timeout = setTimeout(() => {
      func(...args);
    }, wait);
  };
};

/**
 * Throttle function
 */
export const throttle = <T extends (...args: any[]) => any>(
  func: T,
  limit: number
): ((...args: Parameters<T>) => void) => {
  let inThrottle: boolean = false;
  
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => {
        inThrottle = false;
      }, limit);
    }
  };
};

// ============================================================================
// DATA VALIDATION
// ============================================================================

/**
 * Safe JSON parse with fallback
 */
export const safeJSONParse = <T>(str: string, fallback: T): T => {
  try {
    return JSON.parse(str) as T;
  } catch {
    return fallback;
  }
};

/**
 * Validate device ID format
 */
export const isValidDeviceId = (deviceId: string): boolean => {
  return /^0x[0-9A-F]{4}$/.test(deviceId);
};

/**
 * Validate message payload
 */
export const isValidPayload = (payload: string, maxLength: number = 500): boolean => {
  return payload.length > 0 && payload.length <= maxLength;
};

// ============================================================================
// ARRAY UTILITIES
// ============================================================================

/**
 * Remove duplicates from array
 */
export const unique = <T>(array: T[]): T[] => {
  return [...new Set(array)];
};

/**
 * Chunk array into smaller arrays
 */
export const chunk = <T>(array: T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
};

/**
 * Shuffle array
 */
export const shuffle = <T>(array: T[]): T[] => {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};
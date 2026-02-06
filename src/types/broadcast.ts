// =========================================================================
// Broadcast & Queue Types
// =========================================================================

export interface QueuedBroadcast {
  id: string;
  message: string;
  isEmergency: boolean;
  timestamp: number;

  // Retry control
  attempts: number;
  maxAttempts: number;
  nextAttemptAt: number;
}

export interface QueuedChatMessage {
  id: string;
  destId: string;        // Target peer device ID
  message: string;
  timestamp: number;

  // Retry control
  attempts: number;
  maxAttempts: number;
  nextAttemptAt: number;
}

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

// Change this to test the cutoff time feature
// Set to true to simulate being after cutoff time, false for normal operation
const TESTING_MODE = false;

// The hour (in 24-hour format) when the system should stop polling and log out users
const CUTOFF_HOUR = 20; // 20:00 (8pm)

/**
 * Utility function to check if the current time is after the cutoff time (8pm/22:00)
 * @returns boolean - true if current time is after cutoff time, false otherwise
 */
export function isAfterCutoffTime(): boolean {
  // In testing mode, always return the test value
  if (TESTING_MODE) {
    return true; // Simulate being after cutoff time
  }

  // Normal operation: check current time against cutoff
  const now = new Date();
  const currentHour = now.getHours();

  // Cutoff time is 22:00 (10pm) - system uses 24-hour format
  return currentHour >= CUTOFF_HOUR;
}

/**
 * Logs details about time check for debugging
 * @returns object with details about the time check
 */
export function getTimeCheckDetails(): {
  now: string;
  hour: number;
  cutoffHour: number;
  isAfterCutoff: boolean;
  testMode: boolean;
} {
  const now = new Date();
  const hour = now.getHours();

  return {
    now: now.toISOString(),
    hour,
    cutoffHour: CUTOFF_HOUR,
    isAfterCutoff: TESTING_MODE ? true : hour >= CUTOFF_HOUR,
    testMode: TESTING_MODE,
  };
}

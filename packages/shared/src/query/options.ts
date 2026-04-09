export const QUERY_STALE_TIMES = {
  profile: 5 * 60 * 1000,
  habits: 30 * 1000,
  goals: 60 * 1000,
  gamification: 5 * 60 * 1000,
  subscriptionPlans: 60 * 60 * 1000,
  config: 60 * 60 * 1000,
  tags: 2 * 60 * 1000,
  notifications: 60 * 1000,
} as const

/**
 * Polling interval for the Today-view habits list query.
 * Paired with visibility/online guards so polling pauses when the tab/app
 * isn't visible or the device is offline.
 */
export const HABITS_REFETCH_INTERVAL = 30_000

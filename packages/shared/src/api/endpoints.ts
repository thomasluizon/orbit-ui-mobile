// ---------------------------------------------------------------------------
// Orbit API endpoint constants
// All paths are relative to the BFF proxy (/api/...).
// Dynamic segments use functions returning template-literal types.
// ---------------------------------------------------------------------------

export const API = {
  // -- Auth ------------------------------------------------------------------
  auth: {
    sendCode: '/api/auth/send-code',
    verifyCode: '/api/auth/verify-code',
    google: '/api/auth/google',
    logout: '/api/auth/logout',
    requestDeletion: '/api/auth/request-deletion',
    confirmDeletion: '/api/auth/confirm-deletion',
  },

  // -- Profile ---------------------------------------------------------------
  profile: {
    get: '/api/profile',
    timezone: '/api/profile/timezone',
    weekStartDay: '/api/profile/week-start-day',
    aiMemory: '/api/profile/ai-memory',
    aiSummary: '/api/profile/ai-summary',
    onboarding: '/api/profile/onboarding',
    language: '/api/profile/language',
    themePreference: '/api/profile/theme-preference',
    colorScheme: '/api/profile/color-scheme',
    reset: '/api/profile/reset',
  },

  // -- Habits ----------------------------------------------------------------
  habits: {
    list: '/api/habits',
    create: '/api/habits',
    get: (id: string) => `/api/habits/${id}` as const,
    update: (id: string) => `/api/habits/${id}` as const,
    delete: (id: string) => `/api/habits/${id}` as const,
    detail: (id: string) => `/api/habits/${id}/detail` as const,
    log: (id: string) => `/api/habits/${id}/log` as const,
    skip: (id: string) => `/api/habits/${id}/skip` as const,
    duplicate: (id: string) => `/api/habits/${id}/duplicate` as const,
    checklist: (id: string) => `/api/habits/${id}/checklist` as const,
    parent: (id: string) => `/api/habits/${id}/parent` as const,
    subHabits: (parentId: string) => `/api/habits/${parentId}/sub-habits` as const,
    bulk: '/api/habits/bulk',
    bulkLog: '/api/habits/bulk-log',
    bulkSkip: '/api/habits/bulk-skip',
    reorder: '/api/habits/reorder',
    summary: '/api/habits/summary',
    calendarMonth: '/api/habits/calendar-month',
    retrospective: '/api/habits/retrospective',
    metrics: (id: string) => `/api/habits/${id}/metrics` as const,
  },

  // -- Goals -----------------------------------------------------------------
  goals: {
    list: '/api/goals',
    create: '/api/goals',
    get: (id: string) => `/api/goals/${id}` as const,
    update: (id: string) => `/api/goals/${id}` as const,
    delete: (id: string) => `/api/goals/${id}` as const,
    detail: (id: string) => `/api/goals/${id}/detail` as const,
    progress: (id: string) => `/api/goals/${id}/progress` as const,
    status: (id: string) => `/api/goals/${id}/status` as const,
    habits: (id: string) => `/api/goals/${id}/habits` as const,
    metrics: (id: string) => `/api/goals/${id}/metrics` as const,
    reorder: '/api/goals/reorder',
  },

  // -- Tags ------------------------------------------------------------------
  tags: {
    list: '/api/tags',
    create: '/api/tags',
    update: (id: string) => `/api/tags/${id}` as const,
    delete: (id: string) => `/api/tags/${id}` as const,
    assign: (habitId: string) => `/api/tags/${habitId}/assign` as const,
  },

  // -- Notifications ---------------------------------------------------------
  notifications: {
    list: '/api/notifications',
    markRead: (id: string) => `/api/notifications/${id}/read` as const,
    markAllRead: '/api/notifications/read-all',
    delete: (id: string) => `/api/notifications/${id}` as const,
    deleteAll: '/api/notifications/all',
    subscribe: '/api/notifications/subscribe',
    unsubscribe: '/api/notifications/unsubscribe',
  },

  // -- Subscription / Billing ------------------------------------------------
  subscription: {
    checkout: '/api/subscription/checkout',
    portal: '/api/subscription/portal',
    status: '/api/subscription/status',
    plans: '/api/subscription/plans',
    billing: '/api/subscription/billing',
    adReward: '/api/subscription/ad-reward',
  },

  // -- Gamification ----------------------------------------------------------
  gamification: {
    profile: '/api/gamification/profile',
    streak: '/api/gamification/streak',
    streakFreeze: '/api/gamification/streak/freeze',
  },

  // -- Chat / AI -------------------------------------------------------------
  chat: {
    send: '/api/chat',
  },

  // -- User Facts ------------------------------------------------------------
  userFacts: {
    list: '/api/user-facts',
    delete: (id: string) => `/api/user-facts/${id}` as const,
    bulk: '/api/user-facts/bulk',
  },

  // -- Calendar --------------------------------------------------------------
  calendar: {
    events: '/api/calendar/events',
    dismiss: '/api/calendar/dismiss',
  },

  // -- Support ---------------------------------------------------------------
  support: {
    send: '/api/support',
  },

  // -- Referrals -------------------------------------------------------------
  referral: {
    dashboard: '/api/referral/dashboard',
  },

  // -- API Keys --------------------------------------------------------------
  apiKeys: {
    list: '/api/api-keys',
    create: '/api/api-keys',
    delete: (id: string) => `/api/api-keys/${id}` as const,
  },

  // -- Config ----------------------------------------------------------------
  config: {
    get: '/api/config',
  },

  // -- Checklist Templates ---------------------------------------------------
  checklistTemplates: {
    list: '/api/checklist-templates',
    create: '/api/checklist-templates',
    delete: (id: string) => `/api/checklist-templates/${id}` as const,
  },
} as const

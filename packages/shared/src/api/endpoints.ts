export const API = {
  auth: {
    sendCode: '/api/auth/send-code',
    verifyCode: '/api/auth/verify-code',
    google: '/api/auth/google',
    refresh: '/api/auth/refresh',
    logout: '/api/auth/logout',
    requestDeletion: '/api/auth/request-deletion',
    confirmDeletion: '/api/auth/confirm-deletion',
  },

  profile: {
    get: '/api/profile',
    timezone: '/api/profile/timezone',
    weekStartDay: '/api/profile/week-start-day',
    aiMemory: '/api/profile/ai-memory',
    aiSummary: '/api/profile/ai-summary',
    onboarding: '/api/profile/onboarding',
    tour: '/api/profile/tour',
    language: '/api/profile/language',
    themePreference: '/api/profile/theme-preference',
    colorScheme: '/api/profile/color-scheme',
    reset: '/api/profile/reset',
    export: '/api/profile/export',
  },

  habits: {
    list: '/api/habits',
    create: '/api/habits',
    get: (id: string) => `/api/habits/${id}` as const,
    update: (id: string) => `/api/habits/${id}` as const,
    delete: (id: string) => `/api/habits/${id}` as const,
    count: '/api/habits/count',
    widget: '/api/habits/widget',
    detail: (id: string) => `/api/habits/${id}/detail` as const,
    log: (id: string) => `/api/habits/${id}/log` as const,
    skip: (id: string) => `/api/habits/${id}/skip` as const,
    duplicate: (id: string) => `/api/habits/${id}/duplicate` as const,
    checklist: (id: string) => `/api/habits/${id}/checklist` as const,
    parent: (id: string) => `/api/habits/${id}/parent` as const,
    subHabits: (parentId: string) => `/api/habits/${parentId}/sub-habits` as const,
    goals: (id: string) => `/api/habits/${id}/goals` as const,
    bulk: '/api/habits/bulk',
    bulkLog: '/api/habits/bulk/log',
    bulkSkip: '/api/habits/bulk/skip',
    reorder: '/api/habits/reorder',
    summary: '/api/habits/summary',
    calendarMonth: '/api/habits/calendar-month',
    retrospective: '/api/habits/retrospective',
    metrics: (id: string) => `/api/habits/${id}/metrics` as const,
  },

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
    review: '/api/goals/review',
  },

  tags: {
    list: '/api/tags',
    create: '/api/tags',
    update: (id: string) => `/api/tags/${id}` as const,
    delete: (id: string) => `/api/tags/${id}` as const,
    assign: (habitId: string) => `/api/tags/${habitId}/assign` as const,
  },

  notifications: {
    list: '/api/notifications',
    markRead: (id: string) => `/api/notifications/${id}/read` as const,
    markAllRead: '/api/notifications/read-all',
    delete: (id: string) => `/api/notifications/${id}` as const,
    deleteAll: '/api/notifications/all',
    pushToken: '/api/notifications/push-token',
    subscribe: '/api/notifications/subscribe',
    unsubscribe: '/api/notifications/unsubscribe',
    testPush: '/api/notifications/test-push',
  },

  subscription: {
    checkout: '/api/subscriptions/checkout',
    portal: '/api/subscriptions/portal',
    status: '/api/subscriptions/status',
    plans: '/api/subscriptions/plans',
    billing: '/api/subscriptions/billing',
    adReward: '/api/subscriptions/ad-reward',
    playVerify: '/api/subscriptions/play/verify',
  },

  gamification: {
    profile: '/api/gamification/profile',
    achievements: '/api/gamification/achievements',
    streak: '/api/gamification/streak',
  },

  chat: {
    send: '/api/chat',
    stream: '/api/chat/stream',
  },

  ai: {
    capabilities: '/api/ai/capabilities',
    operations: '/api/ai/operations',
    dataCatalog: '/api/ai/data-catalog',
    surfaces: '/api/ai/surfaces',
    pendingOperationConfirm: (id: string) => `/api/ai/pending-operations/${id}/confirm` as const,
    pendingOperationStepUp: (id: string) => `/api/ai/pending-operations/${id}/step-up` as const,
    pendingOperationVerifyStepUp: (id: string) =>
      `/api/ai/pending-operations/${id}/step-up/verify` as const,
    pendingOperationExecute: (id: string) => `/api/ai/pending-operations/${id}/execute` as const,
    clarificationResolve: (operationId: string) =>
      `/api/ai/clarifications/${operationId}/resolve` as const,
  },

  userFacts: {
    list: '/api/user-facts',
    delete: (id: string) => `/api/user-facts/${id}` as const,
    bulk: '/api/user-facts/bulk',
  },

  calendar: {
    events: '/api/calendar/events',
    dismiss: '/api/calendar/dismiss',
    autoSyncState: '/api/calendar/auto-sync/state',
    autoSync: '/api/calendar/auto-sync',
    autoSyncSuggestions: '/api/calendar/auto-sync/suggestions',
    autoSyncDismissSuggestion: (id: string) =>
      `/api/calendar/auto-sync/suggestions/${id}/dismiss` as const,
    autoSyncRun: '/api/calendar/auto-sync/run',
  },

  support: {
    send: '/api/support',
  },

  referral: {
    dashboard: '/api/referrals/dashboard',
  },

  apiKeys: {
    list: '/api/api-keys',
    create: '/api/api-keys',
    delete: (id: string) => `/api/api-keys/${id}` as const,
  },

  config: {
    get: '/api/config',
  },

  sync: {
    batch: '/api/sync/batch',
    changes: '/api/sync/changes',
    changesV2: '/api/sync/v2/changes',
  },

  checklistTemplates: {
    list: '/api/checklist-templates',
    create: '/api/checklist-templates',
    delete: (id: string) => `/api/checklist-templates/${id}` as const,
  },
} as const

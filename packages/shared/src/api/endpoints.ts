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
    name: '/api/profile/name',
    timezone: '/api/profile/timezone',
    weekStartDay: '/api/profile/week-start-day',
    aiMemory: '/api/profile/ai-memory',
    aiSummary: '/api/profile/ai-summary',
    proactiveAstra: '/api/profile/proactive-astra',
    onboarding: '/api/profile/onboarding',
    tour: '/api/profile/tour',
    language: '/api/profile/language',
    themePreference: '/api/profile/theme-preference',
    colorScheme: '/api/profile/color-scheme',
    reset: '/api/profile/reset',
    export: '/api/profile/export',
    handle: '/api/profile/handle',
    socialOptIn: '/api/profile/social-opt-in',
    public: '/api/profile/public',
  },

  publicProfile: {
    bySlug: (slug: string) => `/api/u/${slug}` as const,
  },

  habits: {
    list: '/api/habits',
    create: '/api/habits',
    get: (id: string) => `/api/habits/${id}` as const,
    update: (id: string) => `/api/habits/${id}` as const,
    delete: (id: string) => `/api/habits/${id}` as const,
    restore: (id: string) => `/api/habits/${id}/restore` as const,
    count: '/api/habits/count',
    widget: '/api/habits/widget',
    detail: (id: string) => `/api/habits/${id}/detail` as const,
    log: (id: string) => `/api/habits/${id}/log` as const,
    logs: (id: string) => `/api/habits/${id}/logs` as const,
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
    trends: '/api/habits/trends',
    rescheduleSuggestion: (id: string) => `/api/habits/${id}/reschedule-suggestion` as const,
    suggestSetup: '/api/habits/suggest-setup',
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
    restore: (id: string) => `/api/goals/${id}/restore` as const,
    detail: (id: string) => `/api/goals/${id}/detail` as const,
    progress: (id: string) => `/api/goals/${id}/progress` as const,
    status: (id: string) => `/api/goals/${id}/status` as const,
    habits: (id: string) => `/api/goals/${id}/habits` as const,
    metrics: (id: string) => `/api/goals/${id}/metrics` as const,
    progressHistory: (id: string) => `/api/goals/${id}/progress-history` as const,
    reorder: '/api/goals/reorder',
    review: '/api/goals/review',
  },

  tags: {
    list: '/api/tags',
    create: '/api/tags',
    update: (id: string) => `/api/tags/${id}` as const,
    delete: (id: string) => `/api/tags/${id}` as const,
    restore: (id: string) => `/api/tags/${id}/restore` as const,
    assign: (habitId: string) => `/api/tags/${habitId}/assign` as const,
    suggest: '/api/tags/suggest',
  },

  notifications: {
    list: '/api/notifications',
    markRead: (id: string) => `/api/notifications/${id}/read` as const,
    markAllRead: '/api/notifications/read-all',
    delete: (id: string) => `/api/notifications/${id}` as const,
    deleteAll: '/api/notifications/all',
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
    recap: '/api/gamification/recap',
    streakHistory: '/api/gamification/streak-history',
    xpHistory: '/api/gamification/xp-history',
    reportEvent: '/api/achievements/report-event',
  },

  chat: {
    send: '/api/chat',
    stream: '/api/chat/stream',
    transcribe: '/api/chat/transcribe',
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
    calendars: '/api/calendar/calendars',
    selectedCalendars: '/api/calendar/selected-calendars',
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

  friends: {
    list: '/api/friends',
    requests: '/api/friends/requests',
    acceptRequest: (id: string) => `/api/friends/requests/${id}/accept` as const,
    remove: (friendUserId: string) => `/api/friends/${friendUserId}` as const,
    feed: '/api/friends/feed',
    cheers: '/api/friends/cheers',
    block: '/api/friends/block',
    unblock: (blockedUserId: string) => `/api/friends/block/${blockedUserId}` as const,
    report: '/api/friends/report',
    profile: (userId: string) => `/api/friends/${userId}/profile` as const,
  },

  challenges: {
    list: '/api/challenges',
    create: '/api/challenges',
    join: '/api/challenges/join',
    leave: (id: string) => `/api/challenges/${id}/leave` as const,
    detail: (id: string) => `/api/challenges/${id}` as const,
    setHabits: (id: string) => `/api/challenges/${id}/habits` as const,
  },

  accountability: {
    pairs: '/api/accountability/pairs',
    accept: (id: string) => `/api/accountability/pairs/${id}/accept` as const,
    end: (id: string) => `/api/accountability/pairs/${id}` as const,
    habits: (id: string) => `/api/accountability/pairs/${id}/habits` as const,
    checkIns: (id: string) => `/api/accountability/pairs/${id}/check-ins` as const,
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
    changesV2: '/api/sync/v2/changes',
  },

  checklistTemplates: {
    list: '/api/checklist-templates',
    create: '/api/checklist-templates',
    delete: (id: string) => `/api/checklist-templates/${id}` as const,
  },

  uploads: {
    sign: '/api/uploads/sign',
  },
} as const

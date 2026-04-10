export const habitKeys = {
  all: ['habits'] as const,
  lists: () => [...habitKeys.all, 'list'] as const,
  list: (filters: Record<string, unknown>) => [...habitKeys.lists(), filters] as const,
  count: () => [...habitKeys.all, 'count'] as const,
  details: () => [...habitKeys.all, 'detail'] as const,
  detail: (id: string) => [...habitKeys.details(), id] as const,
  metrics: (id: string) => [...habitKeys.all, 'metrics', id] as const,
  logs: (id: string) => [...habitKeys.all, 'logs', id] as const,
  calendar: (from: string, to: string) => [...habitKeys.all, 'calendar', from, to] as const,
  summaryPrefix: () => [...habitKeys.all, 'summary'] as const,
  summary: (from: string, to: string, locale: string = 'en') =>
    [...habitKeys.all, 'summary', from, to, locale] as const,
  retrospective: (period: string) => [...habitKeys.all, 'retrospective', period] as const,
}

export const goalKeys = {
  all: ['goals'] as const,
  lists: () => [...goalKeys.all, 'list'] as const,
  list: (filters: Record<string, unknown>) => [...goalKeys.lists(), filters] as const,
  details: () => [...goalKeys.all, 'detail'] as const,
  detail: (id: string) => [...goalKeys.details(), id] as const,
  metrics: (id: string) => [...goalKeys.all, 'metrics', id] as const,
  review: (id: string) => [...goalKeys.all, 'review', id] as const,
}

export const profileKeys = {
  all: ['profile'] as const,
  detail: () => [...profileKeys.all, 'detail'] as const,
}

export const tagKeys = {
  all: ['tags'] as const,
  lists: () => [...tagKeys.all, 'list'] as const,
  list: (filters: Record<string, unknown>) => [...tagKeys.lists(), filters] as const,
}

export const notificationKeys = {
  all: ['notifications'] as const,
  lists: () => [...notificationKeys.all, 'list'] as const,
  list: (filters: Record<string, unknown>) => [...notificationKeys.lists(), filters] as const,
}

export const gamificationKeys = {
  all: ['gamification'] as const,
  profile: () => [...gamificationKeys.all, 'profile'] as const,
  achievements: () => [...gamificationKeys.all, 'achievements'] as const,
  streak: () => [...gamificationKeys.all, 'streak'] as const,
}

export const subscriptionKeys = {
  all: ['subscriptions'] as const,
  status: () => [...subscriptionKeys.all, 'status'] as const,
  plans: () => [...subscriptionKeys.all, 'plans'] as const,
  billing: () => [...subscriptionKeys.all, 'billing'] as const,
}

export const referralKeys = {
  all: ['referral'] as const,
  code: () => [...referralKeys.all, 'code'] as const,
  stats: () => [...referralKeys.all, 'stats'] as const,
}

export const apiKeyKeys = {
  all: ['apiKeys'] as const,
  lists: () => [...apiKeyKeys.all, 'list'] as const,
}

export const configKeys = {
  all: ['config'] as const,
  detail: () => [...configKeys.all, 'detail'] as const,
}

export const calendarKeys = {
  all: ['calendar'] as const,
  events: (from: string, to: string) => [...calendarKeys.all, 'events', from, to] as const,
  autoSyncState: () => [...calendarKeys.all, 'auto-sync-state'] as const,
  syncSuggestions: () => [...calendarKeys.all, 'sync-suggestions'] as const,
}

export const userFactKeys = {
  all: ['userFacts'] as const,
  lists: () => [...userFactKeys.all, 'list'] as const,
}

export const versionCheckKeys = {
  all: ['version-check'] as const,
  latest: (pkg: string) => [...versionCheckKeys.all, pkg] as const,
}

export const checklistTemplateKeys = {
  all: ['checklistTemplates'] as const,
  lists: () => [...checklistTemplateKeys.all, 'list'] as const,
  details: () => [...checklistTemplateKeys.all, 'detail'] as const,
  detail: (id: string) => [...checklistTemplateKeys.details(), id] as const,
}

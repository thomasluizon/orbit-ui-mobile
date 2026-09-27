const TRACE_DOMAINS = new Set([
  'account', 'auth', 'calendar', 'catalog', 'chat', 'checklists', 'config',
  'gamification', 'goals', 'habits', 'marketing', 'media', 'memory',
  'notifications', 'profile', 'referrals', 'social', 'subscriptions',
  'support', 'sync', 'tags',
])

export function chatTraceLabelKey(domain: string, access: string): string {
  if (!TRACE_DOMAINS.has(domain) || (access !== 'read' && access !== 'write')) {
    return 'chat.trace.unknown'
  }
  return `chat.trace.${domain}.${access}`
}

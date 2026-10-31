import { randomUUID } from 'node:crypto'

export function freshConversation(vars) {
  if (!vars.clientContext?.conversationId) return
  const conversationId = randomUUID()
  const replace = (value) => {
    if (Array.isArray(value)) return value.map(replace)
    if (!value || typeof value !== 'object') return value
    return Object.fromEntries(Object.entries(value).map(([key, child]) =>
      [key, key === 'conversationId' ? conversationId : replace(child)]))
  }
  Object.assign(vars, replace(vars))
}

export function configureOffers(test) {
  if (!test.metadata.family?.startsWith('offers-')) return
  const vars = test.vars
  vars.offerFamily = test.metadata.family.slice(7)
  vars.expectations ??= {}
  if (vars.composition.mode === 'preview' && !vars.expectations.required) {
    vars.expectations.permittedMutations = (vars.expectations.allowed ?? [])
      .map((name) => ({ name, resultStatus: 'PendingConfirmation' }))
  }
  if (vars.setup) {
    vars.setup.expectations ??= { allowed: ['get_day_summary', 'query_habits', 'query_goals'] }
    if (vars.setup.composition.mode === 'preview') {
      const allowed = ['query_habits', 'query_goals', 'list_tags', 'get_checklist_templates',
        'create_habit', 'create_sub_habit', 'bulk_create_habits', 'update_habit', 'bulk_update_habits']
      vars.setup.expectations = { allowed, permittedMutations: allowed.map((name) => ({ name, resultStatus: 'PendingConfirmation' })) }
    }
  }
}

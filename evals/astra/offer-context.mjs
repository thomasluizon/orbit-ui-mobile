import { randomUUID } from 'node:crypto'
import { tsImport } from 'tsx/esm/api'
import { toolWrites } from './trace-policy.mjs'

const { buildChatClientContext } = await tsImport('../../packages/shared/src/chat/client-context.ts', import.meta.url)

const pendingWrites = (allowed) => allowed.filter((name) => toolWrites.get(name) === true)
  .map((name) => ({ name, resultStatus: 'PendingConfirmation' }))

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
  for (const turn of [vars, vars.setup].filter(Boolean)) {
    turn.clientContext = { ...buildChatClientContext({ platform: test.metadata.platform ?? 'web',
      locale: test.metadata.locale ?? 'en' }), ...turn.clientContext }
  }
  vars.expectations ??= {}
  if (vars.composition.mode === 'preview' && !vars.expectations.required) {
    vars.expectations.permittedMutations = pendingWrites(vars.expectations.allowed ?? [])
  }
  if (vars.setup) {
    vars.setup.expectations ??= { allowed: ['get_daily_summary', 'query_habits', 'query_goals'] }
    if (vars.setup.composition.mode === 'preview') {
      const allowed = ['query_habits', 'query_goals', 'list_tags', 'get_checklist_templates',
        'create_habit', 'create_sub_habit', 'bulk_create_habits', 'update_habit', 'bulk_update_habits']
      vars.setup.expectations = { allowed, permittedMutations: pendingWrites(allowed) }
    }
  }
}

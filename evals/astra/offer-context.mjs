import { randomUUID } from 'node:crypto'
import { tsImport } from 'tsx/esm/api'

const { buildChatClientContext } = await tsImport('../../packages/shared/src/chat/client-context.ts', import.meta.url)

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

// Producer: orbit-api ProcessUserChatCommand returns the turn's conversation as ChatResponse.conversationId and, with
// conversation recording on, answers a turn whose clientContext.conversationId names a stored conversation from that
// stored history. The client takes the id from each response (settleComposerResponse) and sends it on the next turn,
// confirm and execute; a response without one leaves the client's id as it was.
export function followConversation(clientContext, output) {
  const conversationId = output?.composition?.conversationId
  return conversationId ? { ...clientContext, conversationId } : clientContext
}

export function configureOffers(test) {
  if (!test.metadata.family?.startsWith('offers-')) return
  const vars = test.vars
  vars.offerFamily = test.metadata.family.slice(7)
  for (const turn of [vars, vars.setup].filter(Boolean)) {
    turn.clientContext = { ...buildChatClientContext({ platform: test.metadata.platform ?? 'web',
      locale: test.metadata.locale ?? 'en' }), ...turn.clientContext }
  }
}

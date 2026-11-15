import { randomUUID } from 'node:crypto'
import { tsImport } from 'tsx/esm/api'
import { apiOrigin, safeFailureMessage } from '../credentials.mjs'

const shared = (path) => tsImport(`../../../packages/shared/src/${path}`, import.meta.url)
const { buildChatClientContext } = await shared('chat/client-context.ts')
const { buildRecentChatHistory } = await shared('utils/chat-history.ts')
const { sendChatStreamTurn } = await shared('chat/send-stream-turn.ts')
const { buildChatFinalMessageFields } = await shared('chat/final-message.ts')
const { API } = await shared('api/endpoints.ts')
const { CLIENT_TIME_ZONE_HEADER } = await shared('utils/client-context.ts')
const { CHAT_STREAM_IDLE_TIMEOUT_MS } = await shared('chat/stream-constants.ts')

// The state a shipped client keeps for one conversation: its message list, the conversation id it sends on each turn
// and the clock setting of the account profile. `messages` may start with a recorded exchange; a restored conversation
// holds its earlier turns the same way.
export function openConversation({ platform = 'web', locale = 'en', credentialKey, timeZone = 'UTC', uses24HourClock, messages = [] }) {
  return { platform, locale, credentialKey, timeZone, uses24HourClock, conversationId: randomUUID(),
    messages: messages.map(({ role, content }) => ({ id: randomUUID(), role: role === 'assistant' ? 'ai' : 'user', content })) }
}

// The context that useChatRequestPayload of apps/web and apps/mobile builds. The eval types each message in the chat and
// dismisses no offer, so it sends what the apps send then: no entry point intent, no follow-up origin, no earlier
// starting step, no selected offer and no dismissed offer key.
export const clientContextOf = (conversation) => buildChatClientContext({
  platform: conversation.platform, locale: conversation.locale, uses24HourClock: conversation.uses24HourClock,
  conversationId: conversation.conversationId, dismissedOfferKeys: [],
})

// useChatRequestPayload.buildChatFormData of apps/web and apps/mobile. A typed message is already the last stored
// message when the form is built; a card answer is stored only after the server accepts it.
function buildChatForm(conversation, attempted) {
  const form = new FormData()
  form.append('message', attempted.content)
  if (attempted.blockAnswer) form.append('blockAnswer', JSON.stringify(attempted.blockAnswer))
  if (attempted.image) form.append('image', new Blob([attempted.image.bytes], { type: attempted.image.type }), attempted.image.name)
  const history = buildRecentChatHistory(attempted.blockAnswer
    ? [...conversation.messages, { role: 'user', content: attempted.content }] : conversation.messages)
  form.append('history', JSON.stringify(history))
  form.append('clientContext', JSON.stringify(clientContextOf(conversation)))
  return form
}

// The apps read the response body with a streamTextChunks adapter of their own; this is the same adapter for Node.
// The raw text is kept beside the decoded chunks because the shared stream schema drops the opt-in evalTrace.
async function* textChunks(body, frames, armIdleTimer) {
  const decoder = new TextDecoder()
  for await (const bytes of body) {
    armIdleTimer()
    const text = decoder.decode(bytes, { stream: true })
    frames.push(text)
    yield text
  }
}

const streamEvents = (frames) => frames.join('').replaceAll('\r\n', '\n').split('\n\n').flatMap((block) => {
  const payload = block.split('\n').filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trimStart()).join('\n')
  try { return payload ? [JSON.parse(payload)] : [] } catch { return [] }
})

// Producer: orbit-api ChatStreamEvent.Final carries evalTrace on the final event and inside its response. One model call
// is one model_call phase (BudgetedAiCompletionClient measures each completion call).
function readTrace(frames, requestId) {
  const final = streamEvents(frames).findLast((event) => event?.type === 'final')
  const trace = final?.evalTrace ?? final?.response?.evalTrace
  if (!trace || trace.traceId !== requestId || !Array.isArray(trace.toolCalls)) return null
  const phases = Array.isArray(trace.timing?.phases) ? trace.timing.phases : null
  return { requestId, calls: trace.toolCalls.map((call) => ({ id: call?.id, name: call?.name, arguments: call?.arguments,
    resultStatus: call?.status, result: call?.result })),
  timing: trace.timing ?? null, modelCalls: phases ? phases.filter((phase) => phase?.name === 'model_call').length : null }
}

// Producer: orbit-api RequestCorrelationMiddleware answers each request with its request id in X-Orbit-Request-Id.
function openStream(conversation, requestId, exchange) {
  const { frames } = exchange
  return async (turn) => {
    const token = process.env[conversation.credentialKey]
    if (!token) throw new Error('The chat turn requires a refreshed credential.')
    const controller = new AbortController()
    let idleTimer
    const armIdleTimer = () => { clearTimeout(idleTimer); idleTimer = setTimeout(() => controller.abort(), CHAT_STREAM_IDLE_TIMEOUT_MS) }
    armIdleTimer()
    frames.length = 0
    exchange.responseRequestId = null
    const response = await fetch(`${apiOrigin()}${API.chat.stream}`, { method: 'POST', body: turn.payload, signal: controller.signal,
      redirect: 'error',
      headers: { Authorization: `Bearer ${token}`, 'Idempotency-Key': turn.key, 'api-version': '2.0',
        [CLIENT_TIME_ZONE_HEADER]: conversation.timeZone, 'X-Orbit-Eval-Trace': '1', 'X-Orbit-Request-Id': requestId } })
    exchange.responseRequestId = response.headers.get('x-orbit-request-id')
    if (!response.ok) {
      clearTimeout(idleTimer)
      const body = await response.json().catch(() => null)
      return { kind: 'httpError', status: response.status, error: body?.error ?? '', code: body?.code ?? body?.errorCode ?? null }
    }
    const chunks = textChunks(response.body, frames, armIdleTimer)
    return { kind: 'stream', chunks: (async function* () { try { yield* chunks } finally { clearTimeout(idleTimer) } })() }
  }
}

// The shared turn loop of the clients: one resend of the same turn key on an incomplete stream or a 5xx, the shared
// stream parser, and the failure the client would show.
async function transmit(conversation, turn, requestId, exchange, steps = []) {
  let outcome
  try {
    outcome = await sendChatStreamTurn({ turn, isCancelled: () => false, open: openStream(conversation, requestId, exchange),
      callbacks: { onDelta: () => {}, onReset: () => {}, onStep: (step) => steps.push(step) } })
  } catch (error) {
    return { kind: 'failed', status: null, code: null, error: `Chat stream request failed: ${safeFailureMessage(error)}` }
  }
  if (outcome.kind === 'final') return outcome
  if (outcome.kind === 'transportError') {
    return { kind: 'failed', status: null, code: null, error: `Chat stream request failed: ${safeFailureMessage(outcome.error)}` }
  }
  return { kind: 'failed', status: outcome.status ?? null, code: outcome.code ?? null,
    error: outcome.kind === 'incomplete' ? 'The chat stream ended without a final event.' : outcome.error }
}

// Producer: orbit-api ChatTurnStream answers a turn key it already holds with `replayed: true` on the started event and
// the stored final event; ChatTurnIdentity leaves the request id out of the turn's identity.
async function sendAgain(conversation, turn) {
  const exchange = { frames: [], responseRequestId: null }
  const outcome = await transmit(conversation, turn, randomUUID(), exchange)
  if (outcome.kind === 'failed') return outcome
  return { kind: 'final', replayed: streamEvents(exchange.frames).find((event) => event?.type === 'started')?.replayed === true,
    previewIds: (outcome.response.pendingOperations ?? []).map((preview) => preview.id) }
}

// One turn on the path a shipped client uses: POST /api/chat/stream with the form the clients build, through the
// shared turn loop, and the shared final-message builder for the message the client stores. Returns the final response
// with the request id that the response carries and a `sendAgain` that repeats the turn under its turn key, or the failure.
export async function sendTurn(conversation, attempted, requestId = randomUUID()) {
  const typed = !attempted.blockAnswer
  if (typed) conversation.messages.push({ id: randomUUID(), role: 'user', content: attempted.content })
  const turn = { key: randomUUID(), payload: buildChatForm(conversation, attempted) }
  const exchange = { frames: [], responseRequestId: null }
  const steps = []
  const outcome = await transmit(conversation, turn, requestId, exchange, steps)
  if (outcome.kind === 'failed') return outcome
  if (!typed) conversation.messages.push({ id: randomUUID(), role: 'user', content: attempted.content, answerToBlockId: attempted.blockAnswer.blockId })
  const response = outcome.response
  conversation.messages.push({ id: randomUUID(), role: 'ai', timestamp: new Date(), ...buildChatFinalMessageFields(response, steps) })
  // settleComposerResponse: the client takes the conversation id from each response that carries one.
  if (response.conversationId) conversation.conversationId = response.conversationId
  return { kind: 'final', response, requestId, responseRequestId: exchange.responseRequestId,
    trace: readTrace(exchange.frames, requestId), sendAgain: () => sendAgain(conversation, turn) }
}

import { AI_PROVIDER_QUOTA_EXHAUSTED } from '../types/api'
import { consumeChatSseStream } from './sse-stream'
import { isDailyBudgetRefusal, type ChatTurnOptions, type ChatTurnOutcome } from './stream-turn'

async function readChatTurn<Payload>(options: ChatTurnOptions<Payload>, terminal: { received: boolean }): Promise<ChatTurnOutcome> {
  const connection = await options.open(options.turn)
  if (options.isCancelled()) return { kind: 'cancelled' }
  if (connection.kind === 'httpError') return connection
  return consumeChatSseStream(connection.chunks, {
    ...options.callbacks,
    onTerminal: () => { terminal.received = true; options.callbacks.onTerminal?.() },
  })
}

function canResend(outcome: ChatTurnOutcome): boolean {
  if (isDailyBudgetRefusal(outcome)) return false
  if ((outcome.kind === 'error' || outcome.kind === 'httpError') && outcome.code === AI_PROVIDER_QUOTA_EXHAUSTED) return false
  return outcome.kind === 'incomplete' ||
    (outcome.kind === 'httpError' && outcome.status >= 500 && outcome.status < 600)
}

export async function sendChatStreamTurn<Payload>(options: ChatTurnOptions<Payload>): Promise<ChatTurnOutcome> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (options.isCancelled()) return { kind: 'cancelled' }
    const terminal = { received: false }
    try {
      const outcome = await readChatTurn(options, terminal)
      if (options.isCancelled()) return { kind: 'cancelled' }
      if (attempt === 1 || !canResend(outcome)) return outcome
    } catch (error: unknown) {
      if (options.isCancelled()) return { kind: 'cancelled' }
      if (terminal.received || attempt === 1) return { kind: 'transportError', error, terminalReceived: terminal.received }
    }
  }
  return { kind: 'incomplete' }
}


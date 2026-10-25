import { consumeChatSseStream, type ChatStreamCallbacks, type ChatStreamOutcome } from './sse-stream'

export interface PreparedChatTurn<Payload> {
  key: string
  payload: Payload
}

type ChatStreamConnection =
  | { kind: 'stream'; chunks: AsyncIterable<string> }
  | { kind: 'httpError'; status: number; error: string; code: string | null }

type ChatTurnOutcome = ChatStreamOutcome | Exclude<ChatStreamConnection, { kind: 'stream' }>
  | { kind: 'cancelled' }
  | { kind: 'transportError'; error: unknown; terminalReceived: boolean }

interface ChatTurnOptions<Payload> {
  turn: PreparedChatTurn<Payload>
  open: (turn: PreparedChatTurn<Payload>) => Promise<ChatStreamConnection>
  callbacks: ChatStreamCallbacks
  isCancelled: () => boolean
}

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

function isDailyBudgetRefusal(outcome: ChatTurnOutcome): boolean {
  return (outcome.kind === 'error' || outcome.kind === 'httpError') && outcome.code === 'AI_DAILY_BUDGET_EXCEEDED'
}

export function needsNewChatTurn(outcome: ChatTurnOutcome): boolean {
  return isDailyBudgetRefusal(outcome) || outcome.kind === 'final' || outcome.kind === 'error' ||
    (outcome.kind === 'transportError' && outcome.terminalReceived) ||
    (outcome.kind === 'httpError' && outcome.code === 'CHAT_TURN_KEY_CONFLICT')
}

export class ChatTurnReconciliation {
  private revision = 0
  private pendingRevision: number | null = null

  get isPending(): boolean {
    return this.pendingRevision !== null
  }

  reset(): void {
    this.revision += 1
    this.pendingRevision = null
  }

  observe(outcome: ChatTurnOutcome): void {
    if (outcome.kind === 'error' || (outcome.kind === 'transportError' && outcome.terminalReceived)) {
      this.revision += 1
      this.pendingRevision = this.revision
    }
  }

  async reconcileAfterTurn(outcome: ChatTurnOutcome, refresh: () => Promise<void>): Promise<void> {
    this.observe(outcome)
    if (!isDailyBudgetRefusal(outcome)) await this.reconcile(refresh)
  }

  async reconcile(refresh: () => Promise<void>): Promise<void> {
    const pendingRevision = this.pendingRevision
    if (pendingRevision === null) return
    await refresh()
    if (this.pendingRevision === pendingRevision) this.pendingRevision = null
  }
}

export function getChatTurnFailure(outcome: ChatTurnOutcome, fallbackError: string): { status: number | null; error: string; code: string | null } {
  if (outcome.kind === 'transportError') throw outcome.error
  if (outcome.kind === 'error' || outcome.kind === 'httpError') return { status: outcome.status, error: outcome.error, code: outcome.code }
  return { status: null, error: fallbackError, code: null }
}

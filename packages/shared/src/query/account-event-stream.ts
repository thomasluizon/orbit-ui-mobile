import { createApiClientError, extractBackendStatus } from '../utils/error-utils'
import { errorRetryAfter, isUpstreamStarting, parseRetryAfter } from './retry'
import { accountEventPayloadSchema, type AccountEventPayload } from '../types/account-event'

export type ParsedAccountEvent =
  | { type: 'ready'; connectionId: string; id: null }
  | { type: 'changes' | 'resync'; payload: AccountEventPayload; id: string | null }

export function createAccountEventParser(): { feed: (chunk: string) => ParsedAccountEvent[] } {
  let buffer = ''

  return {
    feed(chunk: string): ParsedAccountEvent[] {
      buffer += chunk
      const events: ParsedAccountEvent[] = []
      let boundary = buffer.search(/\r?\n\r?\n/)
      while (boundary >= 0) {
        const separator = buffer.slice(boundary).match(/^\r?\n\r?\n/)?.[0] ?? '\n\n'
        const block = buffer.slice(0, boundary)
        buffer = buffer.slice(boundary + separator.length)
        const event = parseBlock(block)
        if (event) events.push(event)
        boundary = buffer.search(/\r?\n\r?\n/)
      }
      return events
    },
  }
}

function parseBlock(block: string): ParsedAccountEvent | null {
  const lines = block.split(/\r?\n/)
  const field = (name: string) => lines
    .filter((line) => line.startsWith(`${name}:`))
    .map((line) => line.slice(name.length + 1).trimStart())
  const type = field('event')[0]
  const payloadText = field('data').join('\n')
  if (!type || !payloadText) return null
  if (type !== 'ready' && type !== 'changes' && type !== 'resync') return null
  const payload: unknown = JSON.parse(payloadText)
  if (type === 'ready') {
    if (typeof payload !== 'object' || payload === null || !('connectionId' in payload)) return null
    return typeof payload.connectionId === 'string' && payload.connectionId
      ? { type, connectionId: payload.connectionId, id: null } : null
  }
  const result = accountEventPayloadSchema.safeParse(payload)
  if (!result.success) return { type: 'resync', payload: { v: 1, changes: [] }, id: field('id')[0] || null }
  return { type, payload: result.data, id: field('id')[0] || null }
}

interface StreamResponse {
  ok: boolean
  status?: number
  headers?: { get: (name: string) => string | null }
  body: { getReader: () => ReadableStreamDefaultReader<Uint8Array> } | null
}

interface AccountEventStreamOptions {
  open: (signal: AbortSignal, lastEventId: string | null) => Promise<StreamResponse | { sessionRejected: true }>
  lastEventId?: string | null
  resumed?: boolean
  onEvent: (event: ParsedAccountEvent) => void
  onOpen: (openedAt: number, hasReplayCursor: boolean) => void
  onFirstFailure?: (failedAt: number) => void
  onError?: (error: unknown) => void
  onReconnect: () => void
  signal: AbortSignal
}

function waitForRetry(signal: AbortSignal, delay: number): Promise<void> {
  if (signal.aborted) return Promise.resolve()
  return new Promise((resolve) => {
    const timer = setTimeout(finish, delay)
    function finish() {
      clearTimeout(timer)
      signal.removeEventListener('abort', finish)
      resolve()
    }
    signal.addEventListener('abort', finish, { once: true })
  })
}

function streamIsActive(signal: AbortSignal): boolean {
  return !signal.aborted
}

function isUnexpectedStreamFailure(error: unknown, signal: AbortSignal): boolean {
  const status = extractBackendStatus(error)
  return streamIsActive(signal) && status !== 401 && status !== 429 && !isUpstreamStarting(error)
}

interface ConnectionState {
  lastEventId: string | null
  retry: number
  failureReported: boolean
  reportNextFailure: boolean
}

function isRetryingStreamTransport(error: unknown): boolean {
  const status = extractBackendStatus(error)
  return (status !== undefined && [502, 503, 504, 520, 521, 522, 523, 524].includes(status))
    || (error instanceof TypeError && ['Failed to fetch', 'Load failed', 'Network request failed'].includes(error.message))
}

function handleStreamFailure(error: unknown, opened: boolean, options: AccountEventStreamOptions, state: ConnectionState): void {
  if (!state.failureReported && isUnexpectedStreamFailure(error, options.signal) && !isRetryingStreamTransport(error)) {
    state.failureReported = true
    options.onError?.(error)
  }
  state.retry = Math.min(state.retry + 1, 5)
  if (!opened && state.reportNextFailure && isUnexpectedStreamFailure(error, options.signal)) {
    state.reportNextFailure = false
    options.onFirstFailure?.(Date.now())
  }
}

async function consumeConnectionAttempt(options: AccountEventStreamOptions, state: ConnectionState): Promise<boolean> {
  let opened = false
  let retryAfter: number | null = null
  try {
    const response = await options.open(options.signal, state.lastEventId)
    if ('sessionRejected' in response) return false
    if (response.status === 401 || response.status === 429) {
      state.retry = Math.min(state.retry + 1, 5)
      await waitForRetry(options.signal, parseRetryAfter(response.headers?.get('retry-after') ?? null) ?? Math.min(1000 * 2 ** state.retry, 30000))
      return true
    }
    const body = requireStreamBody(response)
    opened = true
    state.failureReported = false
    state.reportNextFailure = true
    if (streamIsActive(options.signal)) options.onOpen(Date.now(), Boolean(state.lastEventId))
    const outcome = await readEvents(body, options.signal, (event) => {
      if (event.id) state.lastEventId = event.id
      options.onEvent(event)
      state.retry = 0
    })
    if (outcome === 'interrupted') state.retry = Math.min(state.retry + 1, 5)
  } catch (error: unknown) {
    handleStreamFailure(error, opened, options, state)
    retryAfter = errorRetryAfter(error)
  }
  if (opened && streamIsActive(options.signal)) options.onReconnect()
  await waitForRetry(options.signal, retryAfter ?? Math.min(1000 * 2 ** state.retry, 30000))
  return true
}

export async function consumeAccountEventStream(options: AccountEventStreamOptions): Promise<void> {
  const state: ConnectionState = {
    lastEventId: options.lastEventId ?? null,
    retry: 0,
    failureReported: false,
    reportNextFailure: options.resumed ?? false,
  }
  while (!options.signal.aborted) {
    if (!await consumeConnectionAttempt(options, state)) return
  }
}

function requireStreamBody(response: StreamResponse): NonNullable<StreamResponse['body']> {
  if (!response.ok) throw createApiClientError(response.status ?? 503, null, 'Account event stream unavailable', response.headers?.get('retry-after'))
  if (!response.body) throw new Error('Account event stream unavailable')
  return response.body
}

async function readEvents(
  body: NonNullable<StreamResponse['body']>,
  signal: AbortSignal,
  onEvent: (event: ParsedAccountEvent) => void,
): Promise<'closed' | 'interrupted'> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  const parser = createAccountEventParser()
  const cancel = () => { void reader.cancel().catch(() => {}) }
  signal.addEventListener('abort', cancel, { once: true })
  try {
    for (;;) {
      if (signal.aborted) return 'closed'
      // WHY: The transport rejects pending reads on connection loss; parsing and handlers still report. https://github.com/thomasluizon/orbit-tickets/issues/1728
      const chunk = await reader.read().catch(() => null)
      if (!chunk) return 'interrupted'
      if (chunk.done || !streamIsActive(signal)) return 'closed'
      for (const event of parser.feed(decoder.decode(chunk.value, { stream: true }))) onEvent(event)
    }
  } finally {
    signal.removeEventListener('abort', cancel)
    cancel()
  }
}

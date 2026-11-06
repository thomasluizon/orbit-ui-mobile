import { parseISO } from 'date-fns'
import { z } from 'zod'
import { readWindowSchema } from '../types/chat'
import { formatAPIDateInTimeZone } from '../utils/dates'
import type { ReadBlockSnapshot } from '../types/chat'
import type { BlockFrameProps, BlockFrameState } from '../contracts/blocks'

export function acceptReadBlockResponse(previous: ReadBlockSnapshot, next: ReadBlockSnapshot, page: boolean): ReadBlockSnapshot {
  if (previous.kind !== next.kind || previous.read.queryId !== next.read.queryId || previous.read.queryFamily !== next.read.queryFamily) {
    throw new Error('READ_QUERY_MISMATCH')
  }
  if (!page) return next
  if (previous.read.revision !== next.read.revision) throw new Error('READ_QUERY_STALE')
  switch (next.kind) {
    case 'habitList':
      if (previous.kind === next.kind) return { ...next, block: { ...next.block, items: [...previous.block.items, ...next.block.items] } }
      break
    case 'goalList':
      if (previous.kind === next.kind) return { ...next, block: { ...next.block, items: [...previous.block.items, ...next.block.items] } }
      break
    case 'recordList':
      if (previous.kind === next.kind) return { ...next, block: { ...next.block, items: [...previous.block.items, ...next.block.items] } }
      break
    case 'calendar':
      if (previous.kind === next.kind) return { ...next, block: { ...next.block, events: [...previous.block.events, ...next.block.events] } }
      break
  }
  throw new Error('READ_QUERY_PAGE_INVALID')
}

export function formatReadWindow(window: { from: string; to: string }, locale: string): string {
  const formatter = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' })
  const from = formatter.format(new Date(`${window.from}T00:00:00Z`))
  return window.from === window.to ? from : `${from} - ${formatter.format(new Date(`${window.to}T00:00:00Z`))}`
}

export function readBlockFailureKey(error: unknown): string {
  const code = error instanceof Error ? error.message : ''
  if (code === 'READ_QUERY_EXPIRED') return 'chat.readBlock.expired'
  if (code === 'READ_QUERY_STALE') return 'chat.readBlock.stale'
  return 'chat.readBlock.error'
}

export interface ReadWindowAccount {
  timeZone: string | null
}

const utcInstantSchema = z.iso.datetime({ offset: true })

/** The account is null until the profile loads, so a UTC window never falls back to the device zone. */
export function readBlockWindow(scope: Record<string, unknown>, account: ReadWindowAccount | null = null): { from: string; to: string } | null {
  if (scope.window_from_utc != null || scope.window_to_utc != null) return readUtcWindow(scope.window_from_utc, scope.window_to_utc, account)
  const from = scope.date_from ?? scope.date ?? scope.as_of
  const to = scope.date_to ?? from
  const window = readWindowSchema.safeParse({ from, to })
  return window.success ? window.data : null
}

function readUtcWindow(fromValue: unknown, toValue: unknown, account: ReadWindowAccount | null): { from: string; to: string } | null {
  const from = utcInstantSchema.safeParse(fromValue)
  const to = utcInstantSchema.safeParse(toValue)
  if (!account || !from.success || !to.success) return null
  const start = parseISO(from.data)
  const end = parseISO(to.data)
  if (end.getTime() <= start.getTime()) return null
  return { from: formatAPIDateInTimeZone(start, account.timeZone), to: formatAPIDateInTimeZone(new Date(end.getTime() - 1), account.timeZone) }
}

function partialReadMessage(recovery: string | null | undefined): string {
  return recovery === 'reconnect' ? 'chat.readBlock.reconnect' : 'chat.readBlock.partial'
}

export function readBlockPresentation(snapshot: ReadBlockSnapshot, localState: import('../contracts/blocks').BlockFrameState, pending: boolean, failure: string | null, queryStale = false, account: ReadWindowAccount | null = null): { state: import('../contracts/blocks').BlockFrameState; message: string | null; window: { from: string; to: string } | null; canPage: boolean } {
  const read = snapshot.read
  const stale = queryStale || failure === 'chat.readBlock.stale' || read.completeness === 'stale'
  let state = localState
  if (localState === 'loading' || localState === 'stale') state = 'resting'
  if (failure || read.recovery) state = 'partiallyFailed'
  if (stale) state = 'stale'
  if (pending) state = 'acting'
  let message = failure
  if (!message && stale) message = 'chat.readBlock.stale'
  if (!message && read.completeness === 'partial' && (read.recovery || !read.nextCursor)) message = partialReadMessage(read.recovery)
  if (!message && localState === 'stale') message = 'chat.readBlock.actionsUnavailable'
  const window = ['periodTotal', 'periodComparison', 'periodInsight', 'habitMonth'].includes(snapshot.kind) ? null : readBlockWindow(read.scope, account)
  return { state, message, window, canPage: Boolean(read.nextCursor) && state !== 'stale' && !queryStale }
}

export function readBlockFrameProps(props: BlockFrameProps, state: BlockFrameState, message: string | null, refresh: () => void, translate: (key: string) => string, actions: BlockFrameProps['actions']): BlockFrameProps {
  if (state === 'stale') return {
    ...props, state, staleMessage: translate(message ?? 'chat.readBlock.stale'),
    staleActions: props.actions, onRefresh: refresh,
  }
  return { ...props, state, staleMessage: undefined, staleActions: undefined, onRefresh: undefined, refreshLabel: undefined, actions }
}

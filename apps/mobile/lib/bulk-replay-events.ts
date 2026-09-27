import AsyncStorage from '@react-native-async-storage/async-storage'
import { getAccountId } from './account-scope'
import { captureError } from './sentry'
import { z } from 'zod'

export interface BulkReplaySuccess {
  mutationId: string
  type: 'bulkLogHabits' | 'bulkSkipHabits'
  items: { habitId: string; date?: string }[]
}

type BulkReplaySuccessListener = (
  success: BulkReplaySuccess,
) => boolean | readonly BulkReplaySuccess['items'][number][]

interface AccountReplayState {
  accountId: string
  pending: BulkReplaySuccess[]
  listeners: Set<BulkReplaySuccessListener>
  loading: Promise<void> | null
  writing: Promise<void>
  delivering: Promise<void>
}

const accounts = new Map<string, AccountReplayState>()

const storedSuccessSchema = z.array(z.object({
  mutationId: z.string(),
  type: z.enum(['bulkLogHabits', 'bulkSkipHabits']),
  items: z.array(z.object({ habitId: z.string(), date: z.string().optional() })),
}))

function storageKey(accountId: string): string {
  return `@orbit/bulk-replay-successes:${accountId}`
}

function getState(accountId: string): AccountReplayState {
  let state = accounts.get(accountId)
  if (!state) {
    state = {
      accountId,
      pending: [],
      listeners: new Set(),
      loading: null,
      writing: Promise.resolve(),
      delivering: Promise.resolve(),
    }
    accounts.set(accountId, state)
  }
  return state
}

function loadPending(state: AccountReplayState): Promise<void> {
  if (!state.loading) {
    state.loading = (async () => {
      const stored = await AsyncStorage.getItem(storageKey(state.accountId))
      if (stored) state.pending = storedSuccessSchema.parse(JSON.parse(stored))
    })().catch((error: unknown) => {
      accounts.delete(state.accountId)
      throw error
    })
  }
  return state.loading
}

function persistPending(state: AccountReplayState): Promise<void> {
  const serialized = JSON.stringify(state.pending)
  state.writing = state.writing.catch(captureError).then(() =>
    AsyncStorage.setItem(storageKey(state.accountId), serialized),
  )
  return state.writing
}

async function deliverPending(
  state: AccountReplayState,
  listener: BulkReplaySuccessListener,
): Promise<void> {
  for (const success of [...state.pending]) {
    if (!state.listeners.has(listener) || getAccountId() !== state.accountId) return
    let handled: ReturnType<BulkReplaySuccessListener>
    try {
      handled = listener(success)
    } catch (error) {
      captureError(error)
      continue
    }
    if (handled === false) continue
    const index = state.pending.indexOf(success)
    if (index < 0) continue
    if (handled === true || handled.length === 0) state.pending.splice(index, 1)
    else state.pending[index] = { ...success, items: [...handled] }
    await persistPending(state)
  }
}

function scheduleDelivery(
  state: AccountReplayState,
  listener: BulkReplaySuccessListener,
): Promise<void> {
  state.delivering = state.delivering.catch(captureError)
    .then(() => deliverPending(state, listener))
  return state.delivering
}

export function subscribeBulkReplaySuccesses(listener: BulkReplaySuccessListener): () => void {
  const accountId = getAccountId()
  if (!accountId) {
    captureError(new Error('Cannot subscribe to bulk replay without account'))
    return () => {}
  }
  const state = getState(accountId)
  state.listeners.add(listener)
  void loadPending(state).then(() => scheduleDelivery(state, listener)).catch(captureError)
  return () => { state.listeners.delete(listener) }
}

export async function notifyBulkReplaySuccess(
  success: BulkReplaySuccess,
  accountId: string | null = getAccountId(),
): Promise<void> {
  if (!accountId) throw new Error('Cannot persist bulk replay without account')
  const state = getState(accountId)
  await loadPending(state)
  state.pending.push(success)
  await persistPending(state)
  if (getAccountId() !== accountId) return
  for (const listener of state.listeners) {
    await scheduleDelivery(state, listener)
    if (!state.pending.some((event) => event.mutationId === success.mutationId)) break
  }
}

import AsyncStorage from '@react-native-async-storage/async-storage'
import { getAccountId } from './account-scope'
import { captureError } from './sentry'
import { z } from 'zod'

export interface BulkReplaySuccess {
  mutationId: string
  type: 'bulkLogHabits' | 'bulkSkipHabits'
  items: { habitId: string; date?: string }[]
}

type BulkReplaySuccessListener = (success: BulkReplaySuccess) => boolean
const listeners = new Set<BulkReplaySuccessListener>()
let pending: BulkReplaySuccess[] = []
let loadedAccountId: string | null = null
let loading: Promise<void> | null = null
let writing: Promise<void> = Promise.resolve()
let delivering: Promise<void> = Promise.resolve()

const storedSuccessSchema = z.array(z.object({
  mutationId: z.string(),
  type: z.enum(['bulkLogHabits', 'bulkSkipHabits']),
  items: z.array(z.object({ habitId: z.string(), date: z.string().optional() })),
}))

function storageKey(accountId: string): string {
  return `@orbit/bulk-replay-successes:${accountId}`
}

async function loadPending(): Promise<void> {
  const accountId = getAccountId()
  if (!accountId) throw new Error('Cannot persist bulk replay without account')
  if (loadedAccountId === accountId) return loading ?? Promise.resolve()
  loadedAccountId = accountId
  pending = []
  loading = (async () => {
    const stored = await AsyncStorage.getItem(storageKey(accountId))
    if (stored) pending = storedSuccessSchema.parse(JSON.parse(stored))
  })().catch((error: unknown) => {
    loadedAccountId = null
    loading = null
    throw error
  })
  await loading
}

function persistPending(): Promise<void> {
  const accountId = loadedAccountId
  if (!accountId) return Promise.resolve()
  const serialized = JSON.stringify(pending)
  writing = writing.catch(captureError).then(() =>
    AsyncStorage.setItem(storageKey(accountId), serialized),
  )
  return writing
}

async function deliverPending(listener: BulkReplaySuccessListener): Promise<void> {
  for (const success of [...pending]) {
    if (!listeners.has(listener)) return
    try {
      if (!listener(success)) continue
    } catch (error) {
      captureError(error)
      continue
    }
    pending.splice(pending.indexOf(success), 1)
    await persistPending()
  }
}

function scheduleDelivery(listener: BulkReplaySuccessListener): Promise<void> {
  delivering = delivering.catch(captureError).then(() => deliverPending(listener))
  return delivering
}

export function subscribeBulkReplaySuccesses(listener: BulkReplaySuccessListener): () => void {
  listeners.add(listener)
  void loadPending().then(() => scheduleDelivery(listener)).catch(captureError)
  return () => { listeners.delete(listener) }
}

export async function notifyBulkReplaySuccess(success: BulkReplaySuccess): Promise<void> {
  await loadPending()
  pending.push(success)
  await persistPending()
  for (const listener of listeners) {
    await scheduleDelivery(listener)
    if (!pending.includes(success)) break
  }
}

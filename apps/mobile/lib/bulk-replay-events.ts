export interface BulkReplaySuccess {
  mutationId: string
  type: 'bulkLogHabits' | 'bulkSkipHabits'
  items: { habitId: string; date?: string }[]
}

type BulkReplaySuccessListener = (success: BulkReplaySuccess) => boolean
const listeners = new Set<BulkReplaySuccessListener>()
const pending: BulkReplaySuccess[] = []

export function subscribeBulkReplaySuccesses(listener: BulkReplaySuccessListener): () => void {
  listeners.add(listener)
  for (const success of [...pending]) {
    if (listener(success)) pending.splice(pending.indexOf(success), 1)
  }
  return () => { listeners.delete(listener) }
}

export function notifyBulkReplaySuccess(success: BulkReplaySuccess): void {
  if (!listeners.size || ![...listeners].some((listener) => listener(success))) {
    pending.push(success)
  }
}

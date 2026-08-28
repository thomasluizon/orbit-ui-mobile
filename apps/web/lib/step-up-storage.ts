import {
  STEP_UP_ATTEMPT_WINDOW_MS,
  getStepUpStorageKey,
  parseStepUpTimingRecord,
  type StepUpOperation,
  type StepUpTimingRecord,
} from '@orbit/shared/utils'

export function readStepUpTiming(operation: StepUpOperation): StepUpTimingRecord | null {
  if (!('localStorage' in globalThis)) return null
  const record = parseStepUpTimingRecord(globalThis.localStorage.getItem(getStepUpStorageKey(operation)))
  return record?.operation === operation ? record : null
}

export function beginStepUpChallenge(operation: StepUpOperation, sentAt = Date.now()): StepUpTimingRecord {
  const previous = readStepUpTiming(operation)
  const exhaustedAt =
    previous?.exhaustedAt !== undefined &&
    sentAt < previous.exhaustedAt + STEP_UP_ATTEMPT_WINDOW_MS
      ? previous.exhaustedAt
      : undefined
  const record: StepUpTimingRecord = {
    operation,
    sentAt,
    ...(exhaustedAt !== undefined ? { exhaustedAt } : {}),
  }
  globalThis.localStorage.setItem(getStepUpStorageKey(operation), JSON.stringify(record))
  return record
}

export function markStepUpExhausted(
  record: StepUpTimingRecord,
  exhaustedAt = Date.now(),
): StepUpTimingRecord {
  const next = { ...record, exhaustedAt }
  globalThis.localStorage.setItem(getStepUpStorageKey(record.operation), JSON.stringify(next))
  return next
}

export function clearStepUpTiming(operation: StepUpOperation): void {
  if ('localStorage' in globalThis) {
    globalThis.localStorage.removeItem(getStepUpStorageKey(operation))
  }
}

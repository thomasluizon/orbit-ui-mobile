import {
  STEP_UP_ATTEMPT_WINDOW_MS,
  getStepUpStorageKey,
  parseStepUpTimingRecord,
  type StepUpOperation,
  type StepUpTimingRecord,
} from '@orbit/shared/utils'

const visibleManagementOperations = new Set<StepUpOperation>()
let apiKeyCreationGrantAvailable = false
let accountId: string | null = null

export function bindStepUpStateToAccount(nextAccountId: string): void {
  if (accountId === nextAccountId) return
  clearStepUpState()
  accountId = nextAccountId
}

export function clearStepUpState(): void {
  visibleManagementOperations.clear()
  apiKeyCreationGrantAvailable = false
  accountId = null
}

export function markStepUpVerified(operation: StepUpOperation): void {
  visibleManagementOperations.add(operation)
  if (operation === 'keys') apiKeyCreationGrantAvailable = true
}

export function isStepUpVerified(operation: StepUpOperation): boolean {
  return visibleManagementOperations.has(operation)
}

export function hasApiKeyCreationGrant(): boolean {
  return apiKeyCreationGrantAvailable
}

export function consumeApiKeyCreationGrant(): void {
  apiKeyCreationGrantAvailable = false
}

export function clearApiKeyCreationGrant(): void {
  apiKeyCreationGrantAvailable = false
}

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

export function markStepUpAttemptFailed(record: StepUpTimingRecord): StepUpTimingRecord {
  const next = { ...record, failedAttempts: (record.failedAttempts ?? 0) + 1 }
  globalThis.localStorage.setItem(getStepUpStorageKey(record.operation), JSON.stringify(next))
  return next
}

export function clearStepUpTiming(operation: StepUpOperation): void {
  if ('localStorage' in globalThis) {
    globalThis.localStorage.removeItem(getStepUpStorageKey(operation))
  }
}

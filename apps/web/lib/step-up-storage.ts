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

/**
 * Persists a timing record under the account that owns it. `localStorage` survives somebody
 * else signing in to this tab, so the entry has to name its account.
 */
function persistStepUpTiming(
  record: StepUpTimingRecord,
  accountId: string | null,
): StepUpTimingRecord {
  if (accountId !== null && 'localStorage' in globalThis) {
    globalThis.localStorage.setItem(
      getStepUpStorageKey(record.operation, accountId),
      JSON.stringify(record),
    )
  }
  return record
}

export function readStepUpTiming(
  operation: StepUpOperation,
  accountId: string | null,
): StepUpTimingRecord | null {
  if (accountId === null) return null
  if (!('localStorage' in globalThis)) return null
  const record = parseStepUpTimingRecord(
    globalThis.localStorage.getItem(getStepUpStorageKey(operation, accountId)),
  )
  return record?.operation === operation ? record : null
}

export function beginStepUpChallenge(
  operation: StepUpOperation,
  accountId: string | null,
  sentAt = Date.now(),
): StepUpTimingRecord {
  const previous = readStepUpTiming(operation, accountId)
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
  return persistStepUpTiming(record, accountId)
}

export function markStepUpExhausted(
  record: StepUpTimingRecord,
  accountId: string | null,
  exhaustedAt = Date.now(),
): StepUpTimingRecord {
  return persistStepUpTiming({ ...record, exhaustedAt }, accountId)
}

export function markStepUpAttemptFailed(
  record: StepUpTimingRecord,
  accountId: string | null,
): StepUpTimingRecord {
  return persistStepUpTiming(
    { ...record, failedAttempts: (record.failedAttempts ?? 0) + 1 },
    accountId,
  )
}

export function clearStepUpTiming(operation: StepUpOperation, accountId: string | null): void {
  if (accountId !== null && 'localStorage' in globalThis) {
    globalThis.localStorage.removeItem(getStepUpStorageKey(operation, accountId))
  }
}

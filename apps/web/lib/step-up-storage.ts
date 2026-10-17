import {
  STEP_UP_ATTEMPT_WINDOW_MS,
  createStepUpSessionState,
  getStepUpStorageKey,
  parseStepUpTimingRecord,
  type StepUpOperation,
  type StepUpTimingRecord,
} from '@orbit/shared/utils'

export const {
  bindStepUpStateToAccount,
  clearStepUpState,
  readApiKeyExpiryDraft,
  retainApiKeyExpiryDraft,
  markStepUpVerified,
  isStepUpVerified,
  hasApiKeyCreationGrant,
  consumeApiKeyCreationGrant,
  clearApiKeyCreationGrant,
} = createStepUpSessionState()

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

import AsyncStorage from '@react-native-async-storage/async-storage'
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
 * Persists a timing record under the account that owns it. `AsyncStorage` survives a sign
 * out and the next sign in on the same device, so the entry has to name its account.
 */
async function persistStepUpTiming(
  record: StepUpTimingRecord,
  accountId: string | null,
): Promise<StepUpTimingRecord> {
  if (accountId !== null) {
    await AsyncStorage.setItem(
      getStepUpStorageKey(record.operation, accountId),
      JSON.stringify(record),
    )
  }
  return record
}

export async function readStepUpTiming(
  operation: StepUpOperation,
  accountId: string | null,
): Promise<StepUpTimingRecord | null> {
  if (accountId === null) return null
  const record = parseStepUpTimingRecord(
    await AsyncStorage.getItem(getStepUpStorageKey(operation, accountId)),
  )
  return record?.operation === operation ? record : null
}

export async function beginStepUpChallenge(
  operation: StepUpOperation,
  accountId: string | null,
  sentAt = Date.now(),
): Promise<StepUpTimingRecord> {
  const previous = await readStepUpTiming(operation, accountId)
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

export async function markStepUpExhausted(
  record: StepUpTimingRecord,
  accountId: string | null,
  exhaustedAt = Date.now(),
): Promise<StepUpTimingRecord> {
  return persistStepUpTiming({ ...record, exhaustedAt }, accountId)
}

export async function markStepUpAttemptFailed(
  record: StepUpTimingRecord,
  accountId: string | null,
): Promise<StepUpTimingRecord> {
  return persistStepUpTiming(
    { ...record, failedAttempts: (record.failedAttempts ?? 0) + 1 },
    accountId,
  )
}

export async function clearStepUpTiming(
  operation: StepUpOperation,
  accountId: string | null,
): Promise<void> {
  if (accountId === null) return
  await AsyncStorage.removeItem(getStepUpStorageKey(operation, accountId))
}

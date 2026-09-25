import AsyncStorage from '@react-native-async-storage/async-storage'
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
 * Persists a timing record under the account that owns it.
 *
 * `AsyncStorage` survives a sign out and the next sign in on the same device, so the entry has to
 * name its account. An app holding no account cannot attribute the record to anybody, so it writes
 * nothing and the returned record still describes the challenge this app just started.
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

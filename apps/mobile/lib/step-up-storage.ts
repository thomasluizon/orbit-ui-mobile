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

export async function readStepUpTiming(
  operation: StepUpOperation,
): Promise<StepUpTimingRecord | null> {
  const record = parseStepUpTimingRecord(
    await AsyncStorage.getItem(getStepUpStorageKey(operation)),
  )
  return record?.operation === operation ? record : null
}

export async function beginStepUpChallenge(
  operation: StepUpOperation,
  sentAt = Date.now(),
): Promise<StepUpTimingRecord> {
  const previous = await readStepUpTiming(operation)
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
  await AsyncStorage.setItem(getStepUpStorageKey(operation), JSON.stringify(record))
  return record
}

export async function markStepUpExhausted(
  record: StepUpTimingRecord,
  exhaustedAt = Date.now(),
): Promise<StepUpTimingRecord> {
  const next = { ...record, exhaustedAt }
  await AsyncStorage.setItem(getStepUpStorageKey(record.operation), JSON.stringify(next))
  return next
}

export async function markStepUpAttemptFailed(
  record: StepUpTimingRecord,
): Promise<StepUpTimingRecord> {
  const next = { ...record, failedAttempts: (record.failedAttempts ?? 0) + 1 }
  await AsyncStorage.setItem(getStepUpStorageKey(record.operation), JSON.stringify(next))
  return next
}

export async function clearStepUpTiming(operation: StepUpOperation): Promise<void> {
  await AsyncStorage.removeItem(getStepUpStorageKey(operation))
}

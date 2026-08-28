import AsyncStorage from '@react-native-async-storage/async-storage'
import {
  STEP_UP_ATTEMPT_WINDOW_MS,
  getStepUpStorageKey,
  parseStepUpTimingRecord,
  type StepUpOperation,
  type StepUpTimingRecord,
} from '@orbit/shared/utils'

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

export async function clearStepUpTiming(operation: StepUpOperation): Promise<void> {
  await AsyncStorage.removeItem(getStepUpStorageKey(operation))
}

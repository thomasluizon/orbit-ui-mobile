export const STEP_UP_CODE_LENGTH = 6
export const STEP_UP_CHALLENGE_DURATION_MS = 10 * 60 * 1000
export const STEP_UP_RESEND_COOLDOWN_MS = 60 * 1000
export const STEP_UP_ATTEMPT_WINDOW_MS = 15 * 60 * 1000

export type StepUpOperation = 'delete' | 'keys'

export const STEP_UP_STORAGE_PREFIX = 'orbit.step-up'

export function getStepUpStorageKey(operation: StepUpOperation): string {
  return `${STEP_UP_STORAGE_PREFIX}.${operation}`
}

export interface StepUpTimingRecord {
  operation: StepUpOperation
  sentAt: number
  failedAttempts?: number
  exhaustedAt?: number
}

export type StepUpPhase =
  | 'challenge'
  | 'checking'
  | 'wrong'
  | 'expired'
  | 'exhausted'
  | 'deactivated'

export function isStepUpOperation(value: string | null | undefined): value is StepUpOperation {
  return value === 'delete' || value === 'keys'
}

export function normalizeStepUpCode(value: string, length = STEP_UP_CODE_LENGTH): string {
  return value.replaceAll(/\D/g, '').slice(0, length)
}

export function parseStepUpTimingRecord(value: string | null): StepUpTimingRecord | null {
  if (!value) return null

  try {
    const parsed = JSON.parse(value) as Record<string, unknown>
    const operation = typeof parsed.operation === 'string' ? parsed.operation : null
    if (!isStepUpOperation(operation)) {
      return null
    }
    if (typeof parsed.sentAt !== 'number' || !Number.isFinite(parsed.sentAt)) {
      return null
    }
    if (
      parsed.failedAttempts !== undefined &&
      (typeof parsed.failedAttempts !== 'number' ||
        !Number.isInteger(parsed.failedAttempts) ||
        parsed.failedAttempts < 0)
    ) {
      return null
    }
    if (
      parsed.exhaustedAt !== undefined &&
      (typeof parsed.exhaustedAt !== 'number' || !Number.isFinite(parsed.exhaustedAt))
    ) {
      return null
    }

    return {
      operation,
      sentAt: parsed.sentAt,
      ...(typeof parsed.failedAttempts === 'number'
        ? { failedAttempts: parsed.failedAttempts }
        : {}),
      ...(typeof parsed.exhaustedAt === 'number'
        ? { exhaustedAt: parsed.exhaustedAt }
        : {}),
    }
  } catch {
    return null
  }
}

export function getStepUpPhaseFromTiming(
  record: StepUpTimingRecord,
  now: number,
): StepUpPhase {
  if (
    record.exhaustedAt !== undefined &&
    now < record.exhaustedAt + STEP_UP_ATTEMPT_WINDOW_MS
  ) {
    return 'exhausted'
  }
  if (now >= record.sentAt + STEP_UP_CHALLENGE_DURATION_MS) {
    return 'expired'
  }
  return 'challenge'
}

export function getStepUpCooldownSeconds(record: StepUpTimingRecord, now: number): number {
  return Math.max(
    0,
    Math.ceil((record.sentAt + STEP_UP_RESEND_COOLDOWN_MS - now) / 1000),
  )
}

export function getStepUpLockSeconds(record: StepUpTimingRecord, now: number): number | null {
  if (record.exhaustedAt === undefined) return null
  return Math.max(
    0,
    Math.ceil((record.exhaustedAt + STEP_UP_ATTEMPT_WINDOW_MS - now) / 1000),
  )
}

export function formatStepUpCountdown(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds))
  const minutes = Math.floor(safeSeconds / 60)
  const seconds = String(safeSeconds % 60).padStart(2, '0')
  return `${minutes}:${seconds}`
}

export function extractStepUpAttemptsRemaining(message: string | undefined): number | null {
  if (!message) return null
  const match = /remaining attempts:\s*(\d+)\s*$/i.exec(message.trim())
  if (!match) return null
  const value = Number(match[1])
  return Number.isInteger(value) && value >= 0 ? value : null
}

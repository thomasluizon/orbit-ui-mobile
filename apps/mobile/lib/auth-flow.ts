import AsyncStorage from '@react-native-async-storage/async-storage'
import {
  isValidReferralCode as isValidReferralCodeShared,
  isValidVerificationCode as isValidVerificationCodeShared,
} from '@orbit/shared/utils'

const REFERRAL_CODE_KEY = 'referral_code'
const AUTH_RETURN_URL_KEY = 'auth_return_url'
const REFERRAL_APPLIED_KEY = 'orbit_referral_applied'
let returnUrlAttempt = 0
let returnUrlOperation: Promise<void> = Promise.resolve()

function queueReturnUrlOperation(operation: () => Promise<void>): Promise<void> {
  const pending = returnUrlOperation.then(operation)
  returnUrlOperation = pending.catch(() => {})
  return pending
}

export function createAuthReturnUrlAttempt(): number {
  return ++returnUrlAttempt
}

export function isAuthReturnUrlAttemptCurrent(attemptId: number): boolean {
  return returnUrlAttempt === attemptId
}

export function isValidReferralCode(value: string | null | undefined): value is string {
  return isValidReferralCodeShared(value)
}

export function isValidVerificationCode(value: string | null | undefined): value is string {
  return isValidVerificationCodeShared(value)
}

export function isSafeReturnUrl(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//')
}

export function getSafeReturnUrl(value: string | null | undefined, fallback = '/'): string {
  return isSafeReturnUrl(value) ? value : fallback
}

export async function getStoredReferralCode(): Promise<string | null> {
  const value = await AsyncStorage.getItem(REFERRAL_CODE_KEY)
  return isValidReferralCode(value) ? value : null
}

export async function storeReferralCode(code: string): Promise<void> {
  if (!isValidReferralCode(code)) return
  await AsyncStorage.setItem(REFERRAL_CODE_KEY, code)
}

export async function clearStoredReferralCode(): Promise<void> {
  await AsyncStorage.removeItem(REFERRAL_CODE_KEY)
}

export async function getStoredAuthReturnUrl(attemptId: number): Promise<string | null> {
  await returnUrlOperation
  if (!isAuthReturnUrlAttemptCurrent(attemptId)) return null
  const value = await AsyncStorage.getItem(AUTH_RETURN_URL_KEY)
  return isAuthReturnUrlAttemptCurrent(attemptId) && isSafeReturnUrl(value) ? value : null
}

export async function storeAuthReturnUrl(returnUrl: string, attemptId: number): Promise<void> {
  if (!isSafeReturnUrl(returnUrl)) return
  await queueReturnUrlOperation(async () => {
    if (isAuthReturnUrlAttemptCurrent(attemptId)) {
      await AsyncStorage.setItem(AUTH_RETURN_URL_KEY, returnUrl)
    }
  })
}

export async function consumeStoredAuthReturnUrl(attemptId: number): Promise<string | null> {
  const value = await getStoredAuthReturnUrl(attemptId)
  await clearStoredAuthReturnUrl(attemptId)
  return value
}

export async function clearStoredAuthReturnUrl(attemptId?: number): Promise<void> {
  if (attemptId === undefined) returnUrlAttempt += 1
  await queueReturnUrlOperation(async () => {
    if (attemptId === undefined || isAuthReturnUrlAttemptCurrent(attemptId)) {
      await AsyncStorage.removeItem(AUTH_RETURN_URL_KEY)
    }
  })
}

export async function markReferralApplied(): Promise<void> {
  await AsyncStorage.setItem(REFERRAL_APPLIED_KEY, '1')
}

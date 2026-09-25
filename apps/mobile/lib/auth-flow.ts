import AsyncStorage from '@react-native-async-storage/async-storage'
import {
  isValidReferralCode as isValidReferralCodeShared,
  isValidVerificationCode as isValidVerificationCodeShared,
} from '@orbit/shared/utils'

const REFERRAL_CODE_KEY = 'referral_code'
const AUTH_RETURN_URL_KEY = 'auth_return_url'
let returnUrlMutationTail: Promise<void> = Promise.resolve()
let returnUrlAttempt = 0

function queueReturnUrlMutation<T>(mutation: () => Promise<T>): Promise<T> {
  const result = returnUrlMutationTail.then(mutation, mutation)
  returnUrlMutationTail = result.then(() => {}, () => {})
  return result
}

export function createAuthReturnUrlAttempt(): number {
  return ++returnUrlAttempt
}

export function getAuthReturnUrlAttempt(): number {
  return returnUrlAttempt
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
  return queueReturnUrlMutation(async () => {
    if (!isAuthReturnUrlAttemptCurrent(attemptId)) return null
    const value = await AsyncStorage.getItem(AUTH_RETURN_URL_KEY)
    return isAuthReturnUrlAttemptCurrent(attemptId) && isSafeReturnUrl(value) ? value : null
  })
}

export async function storeAuthReturnUrl(returnUrl: string, attemptId: number): Promise<void> {
  if (!isSafeReturnUrl(returnUrl)) return
  await queueReturnUrlMutation(async () => {
    if (isAuthReturnUrlAttemptCurrent(attemptId)) await AsyncStorage.setItem(AUTH_RETURN_URL_KEY, returnUrl)
  })
}

export async function consumeStoredAuthReturnUrl(attemptId: number): Promise<string | null> {
  return queueReturnUrlMutation(async () => {
    if (!isAuthReturnUrlAttemptCurrent(attemptId)) return null
    const storedUrl = await AsyncStorage.getItem(AUTH_RETURN_URL_KEY)
    if (!isAuthReturnUrlAttemptCurrent(attemptId)) return null
    await AsyncStorage.removeItem(AUTH_RETURN_URL_KEY)
    return isAuthReturnUrlAttemptCurrent(attemptId) && isSafeReturnUrl(storedUrl) ? storedUrl : null
  })
}

export async function clearStoredAuthReturnUrl(
  attemptId: number,
  isCurrentLoginSession?: () => boolean,
): Promise<void> {
  await queueReturnUrlMutation(async () => {
    if (!isAuthReturnUrlAttemptCurrent(attemptId)) return
    if (isCurrentLoginSession && !isCurrentLoginSession()) return
    await AsyncStorage.removeItem(AUTH_RETURN_URL_KEY)
  })
}

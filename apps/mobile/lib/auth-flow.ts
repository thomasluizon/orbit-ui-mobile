import AsyncStorage from '@react-native-async-storage/async-storage'
import {
  isValidReferralCode as isValidReferralCodeShared,
  isValidVerificationCode as isValidVerificationCodeShared,
} from '@orbit/shared/utils'

const REFERRAL_CODE_KEY = 'referral_code'
const AUTH_RETURN_URL_KEY = 'auth_return_url'
let returnUrlMutationTail: Promise<void> = Promise.resolve()

function queueReturnUrlMutation<T>(mutation: () => Promise<T>): Promise<T> {
  const result = returnUrlMutationTail.then(mutation, mutation)
  returnUrlMutationTail = result.then(() => {}, () => {})
  return result
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

export async function getStoredAuthReturnUrl(): Promise<string | null> {
  return queueReturnUrlMutation(async () => {
    const value = await AsyncStorage.getItem(AUTH_RETURN_URL_KEY)
    return isSafeReturnUrl(value) ? value : null
  })
}

export async function storeAuthReturnUrl(returnUrl: string): Promise<void> {
  if (!isSafeReturnUrl(returnUrl)) return
  await queueReturnUrlMutation(() => AsyncStorage.setItem(AUTH_RETURN_URL_KEY, returnUrl))
}

export async function consumeStoredAuthReturnUrl(): Promise<string | null> {
  return queueReturnUrlMutation(async () => {
    const storedUrl = await AsyncStorage.getItem(AUTH_RETURN_URL_KEY)
    await AsyncStorage.removeItem(AUTH_RETURN_URL_KEY)
    return isSafeReturnUrl(storedUrl) ? storedUrl : null
  })
}

export async function clearStoredAuthReturnUrl(isCurrentLoginSession?: () => boolean): Promise<void> {
  await queueReturnUrlMutation(async () => {
    if (isCurrentLoginSession && !isCurrentLoginSession()) return
    const storedUrl = isCurrentLoginSession ? await AsyncStorage.getItem(AUTH_RETURN_URL_KEY) : null
    if (isCurrentLoginSession && !isCurrentLoginSession()) return
    await AsyncStorage.removeItem(AUTH_RETURN_URL_KEY)
    if (isCurrentLoginSession && !isCurrentLoginSession() && storedUrl !== null) {
      await AsyncStorage.setItem(AUTH_RETURN_URL_KEY, storedUrl)
    }
  })
}

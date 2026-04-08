import AsyncStorage from '@react-native-async-storage/async-storage'
import { isValidVerificationCode as isValidVerificationCodeShared } from '@orbit/shared/utils'

const REFERRAL_CODE_KEY = 'referral_code'
const AUTH_RETURN_URL_KEY = 'auth_return_url'
const REFERRAL_APPLIED_KEY = 'orbit_referral_applied'

export function isValidReferralCode(value: string | null | undefined): value is string {
  return typeof value === 'string' && /^[a-zA-Z0-9_-]+$/.test(value)
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
  const value = await AsyncStorage.getItem(AUTH_RETURN_URL_KEY)
  return isSafeReturnUrl(value) ? value : null
}

export async function storeAuthReturnUrl(returnUrl: string): Promise<void> {
  if (!isSafeReturnUrl(returnUrl)) return
  await AsyncStorage.setItem(AUTH_RETURN_URL_KEY, returnUrl)
}

export async function consumeStoredAuthReturnUrl(): Promise<string | null> {
  const value = await getStoredAuthReturnUrl()
  await AsyncStorage.removeItem(AUTH_RETURN_URL_KEY)
  return value
}

export async function clearStoredAuthReturnUrl(): Promise<void> {
  await AsyncStorage.removeItem(AUTH_RETURN_URL_KEY)
}

export async function markReferralApplied(): Promise<void> {
  await AsyncStorage.setItem(REFERRAL_APPLIED_KEY, '1')
}

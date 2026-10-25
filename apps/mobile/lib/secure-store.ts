import * as SecureStore from 'expo-secure-store'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Platform } from 'react-native'

const TOKEN_KEY = 'auth_token'
const REFRESH_TOKEN_KEY = 'refresh_token'
const INSTALL_MARKER_KEY = 'orbit:ios-install'
let installInitialization: Promise<void> | null = null

async function resetKeychainOnInstall(): Promise<void> {
  if (await AsyncStorage.getItem(INSTALL_MARKER_KEY) === '1') return
  await Promise.all([TOKEN_KEY, REFRESH_TOKEN_KEY, 'google_auth_attempt', 'account_config']
    .map((key) => SecureStore.deleteItemAsync(key)))
  const { clearWidgetToken } = await import('./orbit-widget')
  await clearWidgetToken()
  await AsyncStorage.setItem(INSTALL_MARKER_KEY, '1')
}

async function initializeInstall(): Promise<void> {
  if (Platform.OS !== 'ios') return
  installInitialization ??= resetKeychainOnInstall().catch((error: unknown) => {
    installInitialization = null
    throw error
  })
  await installInitialization
}

export async function getToken(): Promise<string | null> {
  await initializeInstall()
  return SecureStore.getItemAsync(TOKEN_KEY)
}

export async function setToken(token: string): Promise<void> {
  await initializeInstall()
  await SecureStore.setItemAsync(TOKEN_KEY, token)
}

export async function clearToken(): Promise<void> {
  await initializeInstall()
  await SecureStore.deleteItemAsync(TOKEN_KEY)
}

export async function getRefreshToken(): Promise<string | null> {
  await initializeInstall()
  return SecureStore.getItemAsync(REFRESH_TOKEN_KEY)
}

export async function setRefreshToken(token: string): Promise<void> {
  await initializeInstall()
  await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, token)
}

export async function clearRefreshToken(): Promise<void> {
  await initializeInstall()
  await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY)
}

export async function clearAllTokens(): Promise<void> {
  await Promise.all([clearToken(), clearRefreshToken()])
}

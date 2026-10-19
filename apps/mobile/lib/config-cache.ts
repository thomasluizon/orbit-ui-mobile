import * as Sentry from '@sentry/react-native'
import { createConfigCache, type ConfigCache } from '@orbit/shared/query'
import * as SecureStore from 'expo-secure-store'

const CONFIG_KEY = 'account_config'

export const configCache: ConfigCache = createConfigCache((error) => Sentry.captureException(error), {
  read: () => SecureStore.getItemAsync(CONFIG_KEY),
  write: (value) => SecureStore.setItemAsync(CONFIG_KEY, value),
  clear: () => SecureStore.deleteItemAsync(CONFIG_KEY),
})

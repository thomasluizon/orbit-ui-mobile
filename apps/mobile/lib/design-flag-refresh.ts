import { API } from '@orbit/shared/api'
import { configCache } from './config-cache'
import { apiClient } from './api-client'
import { rememberAccountDesign } from './design-bundle'
import { captureError } from './sentry'

export function subscribeToDesignFlag(): () => void {
  return configCache.subscribe(() => {
    const { accountId, config } = configCache.getSnapshot()
    if (accountId && config) {
      void rememberAccountDesign(accountId, config.features.redesign?.enabled === true).catch(captureError)
    }
  })
}

export async function refreshDesignFlag(): Promise<void> {
  const scope = configCache.getSnapshot()
  if (!scope.accountId) return
  try {
    await configCache.fetch(scope, () => apiClient<unknown>(API.config.get))
  } catch (error) {
    captureError(error)
  }
}

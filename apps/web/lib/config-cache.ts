import { isNetworkUnavailableError } from '@orbit/shared/utils'
import * as Sentry from '@sentry/nextjs'
import { createConfigCache, type ConfigCache } from '@orbit/shared/query'

export const configCache: ConfigCache = createConfigCache((error) => {
  if (!isNetworkUnavailableError(error)) Sentry.captureException(error)
})

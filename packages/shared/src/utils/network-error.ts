import { extractBackendStatus } from './error-utils'

export class AuthRefreshNetworkError extends TypeError {
  constructor() {
    super('Network request failed')
    this.name = 'AuthRefreshNetworkError'
  }
}

const networkMessages = new Set([
  'Failed to fetch',
  'Load failed',
  'Network request failed',
  'Network request timed out',
])

export function isNetworkUnavailableError(error: unknown): boolean {
  if (!(error instanceof Error) || extractBackendStatus(error) !== undefined) return false
  return networkMessages.has(error.message)
    || error.message.startsWith('fetch failed: java.net.UnknownHostException:')
}

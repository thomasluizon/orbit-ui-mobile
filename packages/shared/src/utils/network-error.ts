import { extractBackendStatus } from './error-utils'

export class AuthRefreshNetworkError extends TypeError {
  constructor() {
    super('Network request failed')
    this.name = 'AuthRefreshNetworkError'
  }
}

const browserNetworkMessage = /^(?:Failed to fetch|Load failed|NetworkError when attempting to fetch resource\.)(?: \([^()]+\))?$/
const expoNetworkMessage = /^fetch failed: (?:java\.net\.|javax\.net\.ssl\.|java\.io\.|okhttp3\.)/
const nativeNetworkMessages = new Set([
  'Network request failed',
  'Network request timed out',
])

export function isNetworkUnavailableError(error: unknown): boolean {
  if (!(error instanceof Error) || extractBackendStatus(error) !== undefined) return false
  return browserNetworkMessage.test(error.message)
    || nativeNetworkMessages.has(error.message)
    || expoNetworkMessage.test(error.message)
}

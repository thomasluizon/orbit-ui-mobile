import { expect, it } from 'vitest'
import { AuthRefreshNetworkError, isNetworkUnavailableError } from '../utils/network-error'
import { createApiClientError } from '../utils/error-utils'

it.each([
  new TypeError('Failed to fetch'),
  new TypeError('Load failed'),
  new TypeError('Network request failed'),
  new TypeError('Network request timed out'),
  new Error('Network request failed'),
  new AuthRefreshNetworkError(),
  new Error('fetch failed: java.net.UnknownHostException: Unable to resolve host "example.invalid": No address associated with hostname'),
])('recognizes an unavailable network: $message', (error) => {
  expect(isNetworkUnavailableError(error)).toBe(true)
})

it.each([
  createApiClientError(500, null, 'Internal server error'),
  createApiClientError(500, null, 'Failed to fetch'),
  new TypeError('Cannot read properties of undefined'),
  new SyntaxError('Unexpected token'),
  new Error('fetch failed: Redirect is not allowed'),
  new Error('fetch failed: java.lang.IllegalStateException: Invalid request'),
  new Error('fetch failed: The operation was aborted.'),
  new Error('A network error occurred while rendering'),
  null,
  'Failed to fetch',
  { message: 'Failed to fetch' },
])('keeps server failures, programming errors and unknown values reportable: %s', (error) => {
  expect(isNetworkUnavailableError(error)).toBe(false)
})

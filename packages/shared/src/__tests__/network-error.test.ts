import { expect, it } from 'vitest'
import { AuthRefreshNetworkError, isNetworkUnavailableError } from '../utils/network-error'
import { createApiClientError } from '../utils/error-utils'

it.each([
  new TypeError('Failed to fetch'),
  new TypeError('Load failed'),
  new TypeError('NetworkError when attempting to fetch resource.'),
  new TypeError('Failed to fetch (example.invalid)'),
  new TypeError('Load failed (example.invalid:443)'),
  new TypeError('NetworkError when attempting to fetch resource. (example.invalid)'),
  new TypeError('Network request failed'),
  new TypeError('Network request timed out'),
  new Error('Network request failed'),
  new AuthRefreshNetworkError(),
  new Error('fetch failed: java.net.UnknownHostException: Unable to resolve host "example.invalid": No address associated with hostname'),
  new Error('fetch failed: java.net.SocketTimeoutException: timeout'),
  new Error('fetch failed: java.net.ConnectException: Failed to connect'),
  new Error('fetch failed: javax.net.ssl.SSLHandshakeException: Connection closed'),
  new Error('fetch failed: java.net.SocketException: Connection reset'),
  new Error('fetch failed: java.io.InterruptedIOException: timeout'),
  new Error('fetch failed: java.io.IOException: unexpected end of stream'),
  new Error('fetch failed: okhttp3.internal.http2.StreamResetException: stream was reset: REFUSED_STREAM'),
])('recognizes an unavailable network: $message', (error) => {
  expect(isNetworkUnavailableError(error)).toBe(true)
})

it.each([
  createApiClientError(500, null, 'Internal server error'),
  createApiClientError(500, null, 'Failed to fetch'),
  createApiClientError(500, null, 'fetch failed: java.net.ConnectException: Failed to connect'),
  new TypeError('x is not a function'),
  new TypeError('Cannot read properties of undefined'),
  new SyntaxError('Unexpected token'),
  new Error('fetch failed: Redirect is not allowed'),
  new Error('fetch failed: java.lang.IllegalStateException: Invalid request'),
  new Error('fetch failed: The operation was aborted.'),
  new Error('fetch failed: Fetch request has been canceled'),
  new Error('Failed to fetch a component'),
  new Error('A network error occurred while rendering'),
  null,
  'Failed to fetch',
  { message: 'Failed to fetch' },
])('keeps server failures, programming errors and unknown values reportable: %s', (error) => {
  expect(isNetworkUnavailableError(error)).toBe(false)
})

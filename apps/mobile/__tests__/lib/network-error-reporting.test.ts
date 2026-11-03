import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import * as SecureStore from 'expo-secure-store'
import { DEFAULT_CONFIG } from '@orbit/shared/types/config'
import { captureException } from '@sentry/react-native'
import { configKeys } from '@orbit/shared/query'
import { createApiClientError } from '@orbit/shared/utils'
import { FetchError } from '../../../../node_modules/expo/build/winter/fetch/FetchErrors.js'
import { CodedError } from '../../../../node_modules/expo-modules-core/build/errors/CodedError.js'
import { queryClient } from '@/lib/query-client'
import { configCache } from '@/lib/config-cache'

const dnsFailure = FetchError.createFromError(new CodedError('ERR_UNEXPECTED',
  'java.net.UnknownHostException: Unable to resolve host "example.invalid": No address associated with hostname'))

beforeEach(() => { vi.mocked(captureException).mockClear(); configCache.setAccount('network-account') })
afterEach(() => { queryClient.clear(); configCache.setAccount(null); vi.restoreAllMocks() })

it.each([
  { error: dnsFailure, reports: false },
  { error: new TypeError('Network request failed'), reports: false },
  { error: createApiClientError(500, null, 'Internal server error'), reports: true },
  { error: new TypeError('Cannot read properties of undefined'), reports: true },
])('reports config failures only when actionable: $error.message', async ({ error, reports }) => {
  const scope = configCache.getSnapshot()
  await expect(queryClient.fetchQuery({
    queryKey: configKeys.detail(scope.accountId, scope.generation), retry: false,
    queryFn: () => configCache.fetch(scope, () => Promise.reject(error)),
  })).rejects.toBe(error)
  expect(captureException).toHaveBeenCalledTimes(reports ? 1 : 0)
  if (reports) expect(captureException).toHaveBeenCalledWith(error)
})

it.each([
  { error: dnsFailure, reports: false },
  { error: new Error('Secure storage unavailable'), reports: true },
])('filters config restoration failures at its reporting boundary: $error.message', async ({ error, reports }) => {
  vi.spyOn(SecureStore, 'getItemAsync').mockRejectedValueOnce(error)
  const scope = configCache.getSnapshot()
  await expect(configCache.fetch(scope, () => Promise.resolve(DEFAULT_CONFIG))).resolves.toEqual(DEFAULT_CONFIG)
  if (reports) expect(captureException).toHaveBeenCalledWith(error)
  else expect(captureException).not.toHaveBeenCalled()
})

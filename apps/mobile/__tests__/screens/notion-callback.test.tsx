import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { createNotionCallback } from '@orbit/shared/__tests__/notion-fixtures'
import { API } from '@orbit/shared/api'
import Callback from '@/app/auth-callback/notion'
const TestRenderer = require('react-test-renderer')
const mocks = vi.hoisted(() => ({ params: {}, replace: vi.fn(), complete: vi.fn() }))
vi.mock('expo-router', () => ({ useLocalSearchParams: () => mocks.params, useRouter: () => ({ replace: mocks.replace }) }))
vi.mock('react-i18next', async (original) => ({ ...await original<typeof import('react-i18next')>(), useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock('@/lib/api-client', () => ({ apiClient: mocks.complete }))
vi.mock('@/stores/auth-store', () => ({ getSessionGeneration: () => ({ epoch: 0 }) }))
beforeEach(() => { vi.clearAllMocks(); mocks.params = { code: 'oauth-code', state: 'oauth-state' }; mocks.complete.mockResolvedValue(undefined) })
let tree: ReturnType<typeof TestRenderer.create>
afterEach(() => TestRenderer.act(() => tree?.unmount()))
function mount() { TestRenderer.act(() => { tree = TestRenderer.create(<QueryClientProvider client={new QueryClient()}><Callback /></QueryClientProvider>) }) }
it('posts code, state and redirect URI once and returns to Astra settings', async () => {
  mount()
  await vi.waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/profile/astra'))
  expect(mocks.complete).toHaveBeenCalledExactlyOnceWith(API.connections.notionCallback, expect.objectContaining({ method: 'POST' }))
  expect(JSON.parse(mocks.complete.mock.calls[0]![1].body)).toEqual(createNotionCallback())
})
it('returns a cancelled consent without posting or displaying an error', async () => {
  mocks.params = { error: 'access_denied', state: 'oauth-state' }; mount()
  await vi.waitFor(() => expect(mocks.replace).toHaveBeenCalledExactlyOnceWith('/profile/astra'))
  expect(mocks.complete).not.toHaveBeenCalled()
})
it.each<Record<string, string>>([{ code: 'oauth-code' }, { error: 'server_error' }])('rejects an incomplete or failed callback', async (params) => {
  mocks.params = params; mount()
  await vi.waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/profile/astra?notionError=1'))
  expect(mocks.complete).not.toHaveBeenCalled()
})
it('returns a failed exchange to the retryable error on Astra settings', async () => {
  mocks.complete.mockRejectedValue(new Error('Unavailable')); mount()
  await vi.waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/profile/astra?notionError=1'))
})

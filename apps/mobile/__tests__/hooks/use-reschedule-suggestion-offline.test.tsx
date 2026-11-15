import type { ReactElement } from 'react'
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useRescheduleSuggestion } from '@/hooks/use-reschedule-suggestion'

const apiClient = vi.hoisted(() => vi.fn())
vi.mock('@/lib/api-client', () => ({ apiClient }))

const TestRenderer = require('react-test-renderer')

afterEach(() => {
  onlineManager.setOnline(true)
  apiClient.mockReset()
})

describe('mobile useRescheduleSuggestion offline', () => {
  it('reports a paused request, not a running one, while the device is offline', async () => {
    onlineManager.setOnline(false)
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    let latest: ReturnType<typeof useRescheduleSuggestion> | undefined
    function Probe(): ReactElement | null {
      latest = useRescheduleSuggestion({ habitId: 'habit-1', locale: 'en', enabled: true })
      return null
    }
    let tree: { unmount(): void } | undefined
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<QueryClientProvider client={client}><Probe /></QueryClientProvider>)
      await Promise.resolve()
    })
    await vi.waitFor(() => expect(latest?.isPaused).toBe(true))
    expect(latest).toMatchObject({ isFetching: false, suggestion: null, error: null })
    expect(apiClient).not.toHaveBeenCalled()
    TestRenderer.act(() => tree?.unmount())
    client.clear()
  })
})

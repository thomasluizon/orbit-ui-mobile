import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { profileKeys } from '@orbit/shared/query'
import { createApiClientError } from '@orbit/shared/utils'
import allowanceRefusals from '@orbit/shared/test-support/astra-allowance-refusals.fixture.json'
import { useHabitSuggestion } from '@/hooks/use-habit-suggestion'

const renderer = require('react-test-renderer') as typeof import('react-test-renderer')
const { request } = vi.hoisted(() => ({ request: vi.fn() }))
vi.mock('@/lib/api-client', () => ({ apiClient: request }))

describe('native habit and onboarding allowance refusals', () => {
  it.each(allowanceRefusals)('refreshes the $period allowance after a producer refusal in $locale', async ({ body, locale }) => {
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
    client.setQueryData(profileKeys.detail(), { aiMessagesUsed: 0 })
    const error = createApiClientError(403, body, 'failure')
    request.mockRejectedValue(error)
    let suggestion!: ReturnType<typeof useHabitSuggestion>
    function Harness() {
      suggestion = useHabitSuggestion()
      return null
    }
    let tree!: ReturnType<typeof renderer.create>
    await renderer.act(() => { tree = renderer.create(<QueryClientProvider client={client}><Harness /></QueryClientProvider>) })
    try {
      await renderer.act(async () => {
        await expect(suggestion.mutateAsync({ title: 'Run', language: locale === 'en' ? 'en' : 'pt-BR' })).rejects.toBe(error)
      })
      expect(client.getQueryState(profileKeys.detail())?.isInvalidated).toBe(true)
    } finally {
      await renderer.act(() => tree.update(<></>))
      client.clear()
    }
  })
})

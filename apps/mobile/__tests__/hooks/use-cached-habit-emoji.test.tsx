import React from 'react'
import { describe, expect, it } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { habitKeys } from '@orbit/shared/query'
import { createMockHabitScheduleItem } from '@orbit/shared/__tests__/factories'
import { useCachedHabitEmoji } from '@/hooks/use-cached-habit-emoji'

const TestRenderer = require('react-test-renderer')

function readEmoji(habitId: string, client?: QueryClient): string | undefined {
  let emoji: string | undefined
  function Probe() {
    emoji = useCachedHabitEmoji()(habitId)
    return null
  }
  TestRenderer.act(() => {
    TestRenderer.create(client ? <QueryClientProvider client={client}><Probe /></QueryClientProvider> : <Probe />)
  })
  return emoji
}

describe('useCachedHabitEmoji', () => {
  it('reads the emoji of a habit that sits in a cached list', () => {
    const client = new QueryClient()
    client.setQueryData(habitKeys.list({}), [createMockHabitScheduleItem({ id: 'walk', emoji: '🚶' })])
    expect(readEmoji('walk', client)).toBe('🚶')
    expect(readEmoji('missing', client)).toBeUndefined()
  })

  it('returns no emoji outside a query client', () => {
    expect(readEmoji('walk')).toBeUndefined()
  })
})

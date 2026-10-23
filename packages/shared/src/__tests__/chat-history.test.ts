import { describe, expect, it } from 'vitest'
import { habitListCardFixture } from '../test-support/chat-fixtures'
import { buildRecentChatHistory } from '../utils/chat-history'

describe('buildRecentChatHistory', () => {
  it('returns the most recent history entries before the latest message', () => {
    const history = buildRecentChatHistory([
      { role: 'user', content: 'one' },
      { role: 'ai', content: 'two' },
      { role: 'user', content: 'three' },
      { role: 'ai', content: 'four' },
    ])

    expect(history).toEqual([
      { role: 'user', content: 'one' },
      { role: 'assistant', content: 'two' },
      { role: 'user', content: 'three' },
    ])
  })

  it('limits the history to the requested number of previous messages', () => {
    const history = buildRecentChatHistory(
      Array.from({ length: 12 }, (_, index) => ({
        role: index % 2 === 0 ? ('user' as const) : ('ai' as const),
        content: `message-${index + 1}`,
      })),
      5,
    )

    expect(history).toHaveLength(5)
    expect(history[0]).toEqual({ role: 'user', content: 'message-7' })
    expect(history[1]).toEqual({ role: 'assistant', content: 'message-8' })
    expect(history.at(-1)).toEqual({ role: 'user', content: 'message-11' })
  })

  it('omits null content entries from the serialized payload', () => {
    const history = buildRecentChatHistory([
      { role: 'user', content: 'one' },
      { role: 'ai', content: null },
      { role: 'user', content: 'two' },
    ])

    expect(history).toEqual([{ role: 'user', content: 'one' }])
  })
})

it('preserves absolute query scope and identity in block-only history for follow-up requests', () => {
  const read = { queryId: '11111111-1111-4111-8111-111111111111', queryFamily: 'query_habits',
    scope: { from: '2026-10-01', to: '2026-10-07', habitIds: ['habit-1'], includeBadHabits: false },
    revision: 'revision', completeness: 'complete' as const, refreshToken: 'signed' }
  const history = buildRecentChatHistory([
    { role: 'ai', content: '', parts: [{ type: 'block', kind: 'habitList', block: { ...habitListCardFixture, read } }] },
    { role: 'user', content: 'Compare' },
  ])
  expect(JSON.parse(history[0]!.content)).toEqual([{ kind: 'habitList', queryId: read.queryId, queryFamily: read.queryFamily, scope: read.scope }])
  expect(history[0]!.content).not.toContain('signed')
})

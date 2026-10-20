import { describe, expect, it, vi } from 'vitest'
import { createMockHabit } from '@orbit/shared/__tests__/factories'
import { buildSearchMatchLines } from '@orbit/shared/utils'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { SearchResult } from '@/components/search/search-results'
import { expectPersonalTextLayout } from '@/__tests__/support/personal-text'

describe('typed search match', () => {
  it.each(['UnbrokenToken'.repeat(24), 'Read extraordinarilyLongWord daily before breakfast with the people in my neighborhood'])('retains the full match for %s', async (name) => {
    const habit = createMockHabit({ searchMatches: [{ field: 'tag', value: name }] })
    const match = buildSearchMatchLines('Read', habit, (key) => key)[0]!
    let tree!: ReactTestRenderer
    await act(() => { tree = create(<SearchResult habit={habit} query="Read" onOpen={vi.fn()} />) })
    await expectPersonalTextLayout(tree.root, match.fragment!)
    const row = tree.root.findAll((node) => String(node.type) === 'Pressable' && node.props.accessibilityRole === 'button')[0]!
    expect(row.props.accessibilityLabel).toContain(match.text)
    await act(() => tree.update(<></>))
  })
})

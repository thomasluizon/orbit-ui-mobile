import { describe, expect, it, vi } from 'vitest'
import { createMockHabit } from '@orbit/shared/__tests__/factories'
import { SPACING } from '@orbit/shared/theme'
import type { StyleProp, ViewStyle } from 'react-native'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { SearchResult, Searching } from '@/components/search/search-results'
import { createTokensV2 } from '@/lib/theme'
import { expectInsetHairlineRing } from '@/__tests__/support/inset-hairline-ring'
import { measureProfileRow } from '@/__tests__/support/profile-row-geometry'

vi.mock('@/lib/use-app-theme', () => ({ useAppTheme: () => ({ currentScheme: 'orange', currentTheme: 'dark' }) }))

const hairlineGhost = createTokensV2('orange', 'dark').hairlineGhost
type MeasuredHost = Parameters<typeof measureProfileRow>[0]

describe('search rows (mobile)', () => {
  it('draws the result row hairline inside its edge, so the habit well starts at the web padding', async () => {
    const habit = createMockHabit({ title: 'Read', emoji: null })
    let tree!: ReactTestRenderer
    await act(() => { tree = create(<SearchResult habit={habit} query="Read" onOpen={vi.fn()} />) })
    const row = tree.root.findAll((node) => String(node.type) === 'Pressable' && node.props.testID === 'search-result-row')[0]!
    expectInsetHairlineRing((row.props.style as (state: { pressed: boolean }) => StyleProp<ViewStyle>)({ pressed: false }), hairlineGhost)
    const measured = measureProfileRow((tree as unknown as { toJSON: () => MeasuredHost }).toJSON(), 412, 1)
    const frame = measured.boxes.find((box) => box.testID === 'search-result-row')!
    const title = measured.texts.find((text) => text.label === 'Read')!
    expect(title.left, 'the title follows the 12 dp padding, the 40 dp well and the 12 dp gap').toBe(frame.left + SPACING.s12 + 40 + 12)
    await act(() => tree.update(<></>))
  })

  it('draws the skeleton row hairline inside its edge, as the result row does', async () => {
    let tree!: ReactTestRenderer
    await act(() => { tree = create(<Searching />) })
    const rows = tree.root.findAll((node) => String(node.type) === 'View' && node.props.testID === 'search-skeleton-row')
    expect(rows).toHaveLength(3)
    for (const row of rows) expectInsetHairlineRing(row.props.style as StyleProp<ViewStyle>, hairlineGhost)
    const measured = measureProfileRow((tree as unknown as { toJSON: () => MeasuredHost }).toJSON(), 412, 1)
    const frame = measured.boxes.find((box) => box.testID === 'search-skeleton-row')!
    expect(frame.height, 'the skeleton row is as tall as a result row with a 40 dp well').toBe(SPACING.s12 + 40 + SPACING.s12)
    await act(() => tree.update(<></>))
  })
})

import { StyleSheet } from 'react-native'
import { describe, expect, it, vi } from 'vitest'
import { FeatureGuideDrawer } from '@/components/onboarding/feature-guide-drawer'

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock('@/components/ui/sheet', async () => await import('@/__tests__/support/sheet-double'))

const TestRenderer = require('react-test-renderer')

describe('feature guide chip focus', () => {
  it('draws one inset perimeter on every real chip in the horizontal scroller', () => {
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = TestRenderer.create(<FeatureGuideDrawer open onClose={vi.fn()} />) })
    const scroller = tree!.root.findByType('ScrollView')
    const chips = () => scroller.findAllByType('Pressable')
    expect(chips()).toHaveLength(8)
    const readStyle = (index: number) => StyleSheet.flatten(chips()[index].props.style({ pressed: false }))
    for (let index = 0; index < chips().length; index += 1) {
      const resting = readStyle(index)
      const target = {}
      const event = { nativeEvent: { target: index + 1 }, target, currentTarget: target }
      TestRenderer.act(() => chips()[index].props.onFocus?.(event))
      const focused = StyleSheet.flatten(chips()[index].findAllByType('View').at(-1).props.style)
      expect(focused.outlineWidth).toBe(2)
      expect(focused.outlineStyle).toBe('solid')
      expect(focused.outlineOffset + focused.outlineWidth).toBeLessThanOrEqual(0)
      expect(readStyle(index)).toEqual({ ...resting, borderColor: chips()[index].props.accessibilityState.selected ? 'transparent' : resting.borderColor })
      expect(scroller.findAllByType('View').filter((view: { props: { pointerEvents?: string } }) => view.props.pointerEvents === 'none')).toHaveLength(1)
      TestRenderer.act(() => chips()[index].props.onBlur?.(event))
      expect(readStyle(index).outlineWidth ?? 0).toBe(0)
    }
    TestRenderer.act(() => tree!.unmount())
  })
})

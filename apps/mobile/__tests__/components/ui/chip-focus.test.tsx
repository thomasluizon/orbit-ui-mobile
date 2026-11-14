import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native'
import { describe, expect, it, vi } from 'vitest'
import { FeatureGuideDrawer } from '@/components/onboarding/feature-guide-drawer'
import { controlStyle } from '@/__tests__/support/press-feedback'

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
    const readStyle = (index: number) => controlStyle(chips()[index])
    const ringOf = (index: number) => StyleSheet.flatten(chips()[index].findByProps({ testID: 'selection-ring' }).props.style)
    const restingRing = ringOf(chips().findIndex((chip: { props: { accessibilityState: { selected: boolean } } }) => !chip.props.accessibilityState.selected)).borderColor
    for (let index = 0; index < chips().length; index += 1) {
      const resting = readStyle(index)
      const target = {}
      const event = { nativeEvent: { target: index + 1 }, target, currentTarget: target }
      TestRenderer.act(() => chips()[index].props.onFocus?.(event))
      const { outlineWidth, outlineStyle, outlineOffset, outlineColor, ...focusedPaint } = readStyle(index)
      expect(outlineWidth).toBe(2)
      expect(outlineStyle).toBe('solid')
      expect(outlineColor).toBeTruthy()
      expect(outlineOffset + outlineWidth, 'the focus ring stays inside the chip').toBeLessThanOrEqual(0)
      expect(focusedPaint).toEqual(resting)
      const ring = StyleSheet.flatten(chips()[index].findByProps({ testID: 'selection-ring' }).props.style)
      if (chips()[index].props.accessibilityState.selected) expect(ring.top, 'a focused selected chip keeps its ring inside the focus ring').toBeGreaterThanOrEqual(2)
      else expect(ring.borderColor).toBe(restingRing)
      expect([...scroller.findAllByType('Pressable'), ...scroller.findAllByType('View')].filter((node: { props: { style?: unknown } }) => Number({ ...StyleSheet.flatten(node.props.style as StyleProp<ViewStyle>) }.outlineWidth ?? 0) > 0), 'one focus perimeter in the scroller').toHaveLength(1)
      TestRenderer.act(() => chips()[index].props.onBlur?.(event))
      expect(readStyle(index).outlineWidth ?? 0).toBe(0)
    }
    TestRenderer.act(() => tree!.unmount())
  })
})

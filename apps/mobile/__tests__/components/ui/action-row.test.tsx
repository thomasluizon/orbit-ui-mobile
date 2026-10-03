import { describe, expect, it, vi } from 'vitest'
import { ActionRow } from '@/components/ui/action-row'
import { PillButton } from '@/components/ui/pill-button'
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
import Yoga from 'yoga-layout'

vi.mock('@/lib/use-app-theme', () => ({
  useAppTheme: () => ({ currentScheme: 'purple', currentTheme: 'dark' }),
}))

const TestRenderer = require('react-test-renderer')

function ConditionalActions() {
  return <><PillButton variant="ghost">Cancel</PillButton><PillButton size="md">Save</PillButton></>
}

describe('ActionRow', () => {
  it('retains its geometry inside a column under another row', () => {
    let tree: any
    TestRenderer.act(() => { tree = TestRenderer.create(<ActionRow><View style={{ flexDirection: 'column' }}><ActionRow><ConditionalActions /></ActionRow></View></ActionRow>) })
    const rows = tree.root.findAll((node: any) => node.type === 'View' && node.props.testID === 'action-row')
    expect(rows).toHaveLength(2)
    expect(rows[1].props.style).toEqual(expect.objectContaining({ flexDirection: 'row', gap: 12, justifyContent: 'flex-end' }))
  })
  it('owns trailing alignment, wrapping, a twelve pixel gap and one small size through compositions', () => {
    let tree: any
    TestRenderer.act(() => { tree = TestRenderer.create(<ActionRow><ConditionalActions /></ActionRow>) })
    const row = tree.root.findByProps({ testID: 'action-row' })
    expect(row.props.style).toEqual(expect.objectContaining({
      justifyContent: 'flex-end', flexDirection: 'row', flexWrap: 'wrap', gap: 12, width: '100%',
    }))
    expect(tree.root.findAllByType('Pressable').map((button: any) => button.props.testID)).toEqual(['button-ghost-sm', 'button-primary-sm'])
  })

  it('preserves disabled and pending actions', () => {
    let tree: any
    TestRenderer.act(() => { tree = TestRenderer.create(<ActionRow><PillButton variant="ghost" disabled>Cancel</PillButton><PillButton loading>Save</PillButton></ActionRow>) })
    const buttons = tree.root.findAllByType('Pressable')
    expect(buttons.map((button: any) => button.props.accessibilityState)).toEqual([
      { disabled: true, busy: false }, { disabled: true, busy: true },
    ])
  })

  it.each([160, 320, 412, 740])('keeps 48dp hit areas distinct within a %idp parent', (width) => {
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = TestRenderer.create(<ActionRow><ConditionalActions /></ActionRow>) })
    const row = tree.root.findByProps({ testID: 'action-row' })
    const style = StyleSheet.flatten(row.props.style)
    const parent = Yoga.Node.create()
    parent.setWidth(width)
    parent.setFlexDirection(Yoga.FLEX_DIRECTION_ROW)
    parent.setFlexWrap(style.flexWrap === 'wrap' ? Yoga.WRAP_WRAP : Yoga.WRAP_NO_WRAP)
    parent.setJustifyContent(style.justifyContent === 'flex-end' ? Yoga.JUSTIFY_FLEX_END : Yoga.JUSTIFY_FLEX_START)
    parent.setAlignItems(style.alignItems === 'center' ? Yoga.ALIGN_CENTER : Yoga.ALIGN_FLEX_START)
    parent.setGap(Yoga.GUTTER_ALL, style.gap)
    parent.setPadding(Yoga.EDGE_VERTICAL, style.paddingVertical ?? 0)
    const buttons = tree.root.findAllByType('Pressable')
    const boxes = buttons.map((button: { props: { style: (state: { pressed: boolean }) => StyleProp<ViewStyle> } }, index: number) => {
      const geometry = StyleSheet.flatten(button.props.style({ pressed: false }))
      const box = Yoga.Node.create()
      box.setHeight(Math.max(Number(geometry.height ?? 0), Number(geometry.minHeight ?? 0)))
      box.setWidth(80)
      parent.insertChild(box, index)
      return box
    })
    try {
      parent.calculateLayout(width, undefined, Yoga.DIRECTION_LTR)
      for (const [index, box] of boxes.entries()) {
        const slop = buttons[index].props.hitSlop
        expect(box.getComputedTop() - slop).toBeGreaterThanOrEqual(0)
        expect(box.getComputedTop() + box.getComputedHeight() + slop).toBeLessThanOrEqual(parent.getComputedHeight())
        expect(box.getComputedLeft() - slop).toBeGreaterThanOrEqual(-(row.props.hitSlop?.left ?? 0))
        expect(box.getComputedLeft() + box.getComputedWidth() + slop).toBeLessThanOrEqual(width + (row.props.hitSlop?.right ?? 0))
        expect(box.getComputedHeight() + slop * 2).toBe(48)
      }
      const [first, last] = boxes
      expect(last!.getComputedLeft() + last!.getComputedWidth()).toBe(width)
      const gap = first!.getComputedTop() === last!.getComputedTop()
        ? last!.getComputedLeft() - first!.getComputedLeft() - first!.getComputedWidth()
        : last!.getComputedTop() - first!.getComputedTop() - first!.getComputedHeight()
      expect(gap).toBe(12)
      expect(gap - buttons[0].props.hitSlop - buttons[1].props.hitSlop).toBe(8)
    } finally {
      parent.freeRecursive()
      TestRenderer.act(() => tree.unmount())
    }
  })
})

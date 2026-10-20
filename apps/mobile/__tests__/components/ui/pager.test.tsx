import { Pressable, Text } from 'react-native'
import { describe, expect, it, vi } from 'vitest'
import { Pager } from '@/components/ui/pager'
import { press, renderNavigation } from './navigation-render'
const words = { count: 5, label: 'Onboarding steps', backLabel: 'Previous step', forwardLabel: 'Continue' }

describe('Pager', () => {
  it('keeps caller position across presses, unanswered steps and time', () => {
    vi.useFakeTimers()
    const onForward = vi.fn()
    const tree = renderNavigation(<Pager {...words} index={0} onForward={onForward} />)
    try {
      const buttons = tree.hosts().filter((node) => node.props.accessibilityRole === 'button')
      expect(buttons[0]!.props.disabled).toBe(true)
      press(buttons[0]!)
      press(buttons[1]!)
      expect(onForward).toHaveBeenCalledTimes(1)
      vi.advanceTimersByTime(60000)
      expect(tree.hosts().find((node) => node.props.testID === 'pager-segment-0-current')!.props.accessibilityState?.selected).toBe(true)
      tree.update(<Pager {...words} index={2} />)
      expect(tree.hosts().filter((node) => node.props.accessibilityRole === 'button').every((node) => node.props.disabled)).toBe(true)
      expect(tree.hosts().some((node) => node.props.testID === 'pager-segment-2-current')).toBe(true)
    } finally { tree.unmount(); vi.useRealTimers() }
  })
  it('labels the segments, marks one current position and substitutes the final control', () => {
    const onBack = vi.fn()
    const tree = renderNavigation(<Pager {...words} index={3} count={6} onBack={onBack} />)
    expect(tree.hosts().some((node) => node.props.accessibilityLabel === words.label)).toBe(true)
    expect(tree.hosts().filter((node) => node.props.accessibilityState?.selected).map((node) => node.props.testID)).toEqual(['pager-segment-3-current'])
    press(tree.hosts().find((node) => node.props.accessibilityRole === 'button')!)
    expect(onBack).toHaveBeenCalledTimes(1)
    tree.update(<Pager count={6} index={5} label={words.label} backLabel={words.backLabel} forwardSlot={<Pressable accessibilityRole="button" accessibilityLabel="Share recap"><Text>Share recap</Text></Pressable>} />)
    expect(tree.hosts().some((node) => node.props.children === 'Continue')).toBe(false)
    expect(tree.hosts().some((node) => node.props.accessibilityLabel === 'Share recap')).toBe(true)
    tree.unmount()
  })
})

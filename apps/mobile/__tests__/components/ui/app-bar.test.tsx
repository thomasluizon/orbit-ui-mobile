import { createRef } from 'react'
import { Pressable, Text } from 'react-native'
import { describe, expect, it, vi } from 'vitest'
import { AppBar } from '@/components/ui/app-bar'
import { press, renderNavigation } from './navigation-render'

describe('AppBar', () => {
  it('exposes the conversation header as an accessibility focus target', () => {
    const titleRef = createRef<Text>()
    const tree = renderNavigation(<AppBar title="Astra" onBack={() => {}} backLabel="Close" titleRef={titleRef} />)
    const header = tree.hosts().find((node) => node.props.accessibilityRole === 'header')
    expect(header?.props.__nativeTag).toEqual(expect.any(Number))
    expect(titleRef.current).toMatchObject({ __nativeTag: header?.props.__nativeTag })
    tree.unmount()
  })
  it('always shows the title, with no back control in the plain variant', () => {
    const tree = renderNavigation(<AppBar title="Preferences" />)
    expect(tree.hosts().some((node) => node.props.children === 'Preferences')).toBe(true)
    expect(tree.hosts().filter((node) => node.props.accessibilityRole === 'button')).toHaveLength(0)
    tree.unmount()
  })
  it('keeps caller wording and the right action on both variants', () => {
    const onBack = vi.fn()
    const action = <Pressable accessibilityRole="button" accessibilityLabel="Share"><Text>Share</Text></Pressable>
    const tree = renderNavigation(<AppBar title="Habit" onBack={onBack} backLabel="Back to walking" action={action} />)
    press(tree.hosts().find((node) => node.props.accessibilityLabel === 'Back to walking')!)
    expect(onBack).toHaveBeenCalledTimes(1)
    expect(tree.hosts().some((node) => node.props.accessibilityLabel === 'Share')).toBe(true)
    tree.update(<AppBar title="Habit" action={action} />)
    expect(tree.hosts().filter((node) => node.props.accessibilityRole === 'button')).toHaveLength(1)
    tree.unmount()
  })
})

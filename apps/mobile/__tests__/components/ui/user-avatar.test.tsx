import { describe, expect, it } from 'vitest'
import { StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native'
import { act, create } from 'react-test-renderer'
import { UserAvatar } from '@/components/ui/user-avatar'

interface AvatarTree {
  root: {
    findByType(type: unknown): {
      props: { children?: unknown; style: StyleProp<TextStyle & ViewStyle> }
    }
  }
  unmount(): void
}

describe('UserAvatar (mobile)', () => {
  it.each([
    [32, 12],
    [44, 17],
    [56, 20],
    [64, 28],
  ])('renders a %ipx disc with %ipx initials', (size, fontSize) => {
    let tree!: AvatarTree
    void act(() => {
      tree = create(<UserAvatar name="Alex Rivera" size={size} />) as unknown as AvatarTree
    })

    const initials = tree.root.findByType(Text)
    expect(initials.props.children).toBe('AR')
    expect(StyleSheet.flatten(initials.props.style).fontSize).toBe(fontSize)
    expect(StyleSheet.flatten(tree.root.findByType(View).props.style)).toMatchObject({
      width: size,
      height: size,
    })
    void act(() => tree.unmount())
  })
})

import { Pressable, StyleSheet } from 'react-native'
import { describe, expect, it } from 'vitest'
import { Chip } from '@/components/ui/chip'
import { ListRow } from '@/components/ui/list-row'
import { createTokensV2, radius } from '@/lib/theme'

const renderer = require('react-test-renderer')

function pressedStyle(element: React.ReactElement, label: string) {
  let tree: ReturnType<typeof renderer.create>
  renderer.act(() => { tree = renderer.create(element) })
  const control = tree!.root.findAllByType(Pressable).find((node: { props: { accessibilityLabel?: string } }) => node.props.accessibilityLabel === label)
  if (!control) throw new Error(`Missing control: ${label}`)
  const style = StyleSheet.flatten(control.props.style({ pressed: true }))
  renderer.act(() => tree!.unmount())
  return style
}

describe('pressed hit area shapes', () => {
  it('fills the whole rounded ListRow body and its round action', () => {
    const row = <ListRow title="Account" accessibilityLabel="Account" onClick={() => {}} action={{ icon: 'download', label: 'More', onPress: () => {} }} />
    expect(pressedStyle(row, 'Account')).toMatchObject({ borderRadius: 12, overflow: 'hidden', backgroundColor: createTokensV2('purple', 'dark').bgHover })
    expect(pressedStyle(row, 'More')).toMatchObject({ borderRadius: 999, overflow: 'hidden', backgroundColor: createTokensV2('purple', 'dark').bgHover })
  })

  it('clips the chip press fill to its pill hit area', () => {
    expect(pressedStyle(<Chip onPress={() => {}} accessibilityLabel="Active">Active</Chip>, 'Active')).toMatchObject({ borderRadius: radius.full, overflow: 'hidden' })
    expect(pressedStyle(<Chip onPress={() => {}} accessibilityLabel="Selected" active>Selected</Chip>, 'Selected')).toMatchObject({ borderRadius: radius.full, overflow: 'hidden', backgroundColor: createTokensV2('purple', 'dark').bgHover })
  })
})

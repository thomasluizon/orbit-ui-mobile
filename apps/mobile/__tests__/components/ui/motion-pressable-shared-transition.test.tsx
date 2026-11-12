import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { describe, expect, it, vi } from 'vitest'
import { StyleSheet } from 'react-native'
import { MotionPressable } from '@/components/ui/motion-pressable'

const sharedPress = vi.hoisted(() => ({ transition: 'transform 1ms linear' }))

vi.mock('@/components/motion/press-scale', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/components/motion/press-scale')>(),
  PRESS_SCALE_TRANSITION: sharedPress.transition,
}))

describe('motion pressable shared press transition', () => {
  it('eases its press scale with the press scale transition PressScale and ListRow use, so a change to it reaches every press', async () => {
    let tree!: ReactTestRenderer
    await act(() => { tree = create(<MotionPressable onPress={vi.fn()} />) })
    const host = tree.root.findAll((node) => typeof node.type === 'string')[0]!
    expect(StyleSheet.flatten(host.props.style)).toMatchObject({ transition: sharedPress.transition })
    await act(() => tree.update(<></>))
  })
})

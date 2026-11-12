import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { describe, expect, it, vi } from 'vitest'
import { StyleSheet } from 'react-native'
import { MotionPressable } from '@/components/ui/motion-pressable'

const motionOverride = vi.hoisted(() => ({ pressDuration: 151, enter: [0.11, 0.22, 0.33, 0.44] as const }))

vi.mock('@orbit/shared/theme', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@orbit/shared/theme')>()
  return {
    ...actual,
    motionDurations: { ...actual.motionDurations, press: motionOverride.pressDuration },
    motionEasings: { ...actual.motionEasings, enter: motionOverride.enter },
  }
})

describe('motion pressable press timing', () => {
  it('takes the press duration from the press token and eases the scale on the enter curve, the mobile counterpart of --ease-out', async () => {
    let tree!: ReactTestRenderer
    await act(() => { tree = create(<MotionPressable onPress={vi.fn()} />) })
    const host = tree.root.findAll((node) => typeof node.type === 'string')[0]!
    expect(StyleSheet.flatten(host.props.style)).toMatchObject({
      transition: 'transform 151ms cubic-bezier(0.11,0.22,0.33,0.44)',
    })
    await act(() => tree.update(<></>))
  })
})

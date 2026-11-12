import { resolve } from 'node:path'
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { StyleSheet } from 'react-native'
import { MotionPressable } from '@/components/ui/motion-pressable'

/** The installed Reanimated filter, loaded past the test double at run time so the type check does not compile Reanimated's source. */
const REANIMATED_STYLE_FILTER = resolve('../../node_modules/react-native-reanimated/src/css/utils/props.ts')
type StyleFilter = (style: Record<string, unknown>) => readonly [unknown, unknown, unknown, unknown]
let filterCSSAndStyleProperties: StyleFilter

const sharedPress = vi.hoisted(() => ({ transition: 'transform 1ms linear' }))

beforeAll(async () => {
  ({ filterCSSAndStyleProperties } = await import(/* @vite-ignore */ REANIMATED_STYLE_FILTER) as { filterCSSAndStyleProperties: StyleFilter })
})

vi.mock('@/components/motion/press-scale', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/components/motion/press-scale')>(),
  PRESS_SCALE_TRANSITION: sharedPress.transition,
}))

async function renderHost() {
  let tree!: ReactTestRenderer
  await act(() => { tree = create(<MotionPressable onPress={vi.fn()} />) })
  return { tree, host: tree.root.findAll((node) => typeof node.type === 'string')[0]! }
}

/** The transition Reanimated sends to native: React Native flattens the host style (`AnimatedComponent.native.tsx`), then Reanimated filters it. */
function nativeTransition(host: ReactTestInstance) {
  return filterCSSAndStyleProperties(StyleSheet.flatten(host.props.style) as Record<string, unknown>)[1]
}

describe('motion pressable shared press transition', () => {
  it('eases its press scale with the press scale transition PressScale and ListRow use, so a change to it reaches every press', async () => {
    const { tree, host } = await renderHost()
    expect(StyleSheet.flatten(host.props.style)).toMatchObject({ transition: sharedPress.transition })
    await act(() => tree.update(<></>))
  })

  it('declares no transition longhand that Reanimated drops before its shorthand', async () => {
    const { tree, host } = await renderHost()
    const flattened = StyleSheet.flatten(host.props.style) as Record<string, unknown>
    expect(Object.keys(flattened).filter((key) => /^transition[A-Z]/.test(key))).toEqual([])
    expect(nativeTransition(host)).toEqual({ transition: sharedPress.transition })
    await act(() => tree.update(<></>))
  })
})

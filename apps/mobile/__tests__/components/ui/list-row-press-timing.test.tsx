import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { describe, expect, it, vi } from 'vitest'
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native'
import { ListRow } from '@/components/ui/list-row'

const motionOverride = vi.hoisted(() => ({ pressDuration: 151, pressScale: 0.93, enter: [0.11, 0.22, 0.33, 0.44] as const }))

vi.mock('@orbit/shared/theme', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@orbit/shared/theme')>()
  return {
    ...actual,
    motionDurations: { ...actual.motionDurations, press: motionOverride.pressDuration },
    motionEasings: { ...actual.motionEasings, enter: motionOverride.enter },
    orbitalMotion: { ...actual.orbitalMotion, press: { ...actual.orbitalMotion.press, scale: motionOverride.pressScale } },
  }
})

describe('list row press timing', () => {
  it('takes the row press duration and curve from the shared motion tokens', async () => {
    let tree!: ReactTestRenderer
    await act(() => { tree = create(<ListRow title="Frequency" onClick={vi.fn()} />) })
    const content = tree.root.findAll((node) => node.props['data-slot'] === 'list-row-content')[0]!
    expect(StyleSheet.flatten(content.props.style)).toMatchObject({ transition: 'transform 151ms cubic-bezier(0.11,0.22,0.33,0.44)' })
    await act(() => tree.update(<></>))
  })

  it('scales the pressed row content by the shared press scale and returns it to rest', async () => {
    let tree!: ReactTestRenderer
    await act(() => { tree = create(<ListRow title="Frequency" onClick={vi.fn()} />) })
    const pressable = tree.root.findAll((node) => typeof node.props.onPressIn === 'function')[0]!.props as { onPressIn: (event: object) => void; onPressOut: (event: object) => void }
    const content = () => StyleSheet.flatten(tree.root.findAll((node) => node.props['data-slot'] === 'list-row-content')[0]!.props.style as StyleProp<ViewStyle>)
    await act(() => pressable.onPressIn({}))
    expect(content().transform).toEqual([{ scale: motionOverride.pressScale }])
    await act(() => pressable.onPressOut({}))
    expect(content().transform).toBeUndefined()
    await act(() => tree.update(<></>))
  })
})

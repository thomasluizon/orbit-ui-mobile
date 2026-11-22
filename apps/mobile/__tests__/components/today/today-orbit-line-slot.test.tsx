import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer'
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native'
import { describe, expect, it, vi } from 'vitest'
import { TodayOrbitLine } from '@/components/today/today-orbit-line'
import { createTokensV2 } from '@/lib/theme'

describe('Hoje Orbit line on Android', () => {
  it('draws the live Orbit at 48 at the start edge inside its press target, with the foreground planet, still while no conversation entry runs with it', async () => {
    const onPress = vi.fn()
    let tree: ReactTestRenderer | undefined
    await act(() => { tree = create(<TodayOrbitLine text="Sua rotina mudou. Vamos conversar?" destination="Abre a conversa" onPress={onPress} />) })
    const line = tree!.root.findAll((node) => typeof node.type === 'string' && node.props.testID === 'today-orbit-slot')[0]!
    const face = line.findAll((node: ReactTestInstance) => typeof node.type === 'string' && node.props.testID === 'orbit-mascot')[0]!
    expect(face.props).toMatchObject({ width: 48, 'data-orbit-face': 'rig', 'data-orbit-loop': 'still', accessible: false, color: createTokensV2('purple', 'dark').fg1 })
    expect(line.props.accessibilityLabel).toBe('Sua rotina mudou. Vamos conversar?')
    await act(() => (line.props.onPress as () => void)())
    expect(onPress).toHaveBeenCalledOnce()
    await act(() => tree!.unmount())
  })

  it('draws the summary wait from the shared Skeleton fill blocks on the bare line, never from static bars', async () => {
    const tokens = createTokensV2('purple', 'dark')
    let tree: ReactTestRenderer | undefined
    await act(() => { tree = create(<TodayOrbitLine text="summary.loading" destination="Abre a conversa" disabled loading />) })
    const line = tree!.root.findAll((node) => typeof node.type === 'string' && node.props.testID === 'today-orbit-slot')[0]!
    expect(StyleSheet.flatten(line.props.style as StyleProp<ViewStyle>).backgroundColor).toBe('transparent')
    const placeholder = line.findAll((node: ReactTestInstance) => typeof node.type === 'string' && node.props.testID === 'summary-skeleton')[0]!
    expect(placeholder.findAll((node: ReactTestInstance) => typeof node.type === 'string' && node.props.testID === 'skeleton-unit-fill')).toHaveLength(2)
    const colours = placeholder.findAll((node: ReactTestInstance) => typeof node.type === 'string').map((node) => StyleSheet.flatten(node.props.style as StyleProp<ViewStyle>).backgroundColor).filter(Boolean)
    expect(colours).not.toContain(tokens.hairlineStrong)
    expect(colours).toContain(tokens.bgWell)
    await act(() => tree!.unmount())
  })
})

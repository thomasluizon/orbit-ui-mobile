import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer'
import { StyleSheet } from 'react-native'
import { describe, expect, it, vi } from 'vitest'
import { TodayAstraLine } from '@/components/today/today-astra-line'
import { createTokensV2 } from '@/lib/theme'

describe('Hoje Orbit line on Android', () => {
  it('draws Orbit at 48 at the start edge, still inside its press target, with the foreground planet', async () => {
    const onPress = vi.fn()
    let tree: ReactTestRenderer | undefined
    await act(() => { tree = create(<TodayAstraLine text="Sua rotina mudou. Vamos conversar?" destination="Abre a conversa" onPress={onPress} />) })
    const line = tree!.root.findAll((node) => typeof node.type === 'string' && node.props.testID === 'today-astra-slot')[0]!
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
    await act(() => { tree = create(<TodayAstraLine text="summary.loading" destination="Abre a conversa" disabled loading />) })
    const line = tree!.root.findAll((node) => typeof node.type === 'string' && node.props.testID === 'today-astra-slot')[0]!
    expect(StyleSheet.flatten(line.props.style).backgroundColor).toBe('transparent')
    const placeholder = line.findAll((node: ReactTestInstance) => typeof node.type === 'string' && node.props.testID === 'summary-skeleton')[0]!
    expect(placeholder.findAll((node: ReactTestInstance) => typeof node.type === 'string' && node.props.testID === 'skeleton-unit-fill')).toHaveLength(2)
    const colours = placeholder.findAll((node: ReactTestInstance) => typeof node.type === 'string').map((node) => StyleSheet.flatten(node.props.style)?.backgroundColor).filter(Boolean)
    expect(colours).not.toContain(tokens.hairlineStrong)
    expect(colours).toContain(tokens.bgWell)
    await act(() => tree!.unmount())
  })
})

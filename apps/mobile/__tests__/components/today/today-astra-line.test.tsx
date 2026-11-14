import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer'
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
    await act(() => line.props.onPress())
    expect(onPress).toHaveBeenCalledOnce()
    await act(() => tree!.unmount())
  })
})

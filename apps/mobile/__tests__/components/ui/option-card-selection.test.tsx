import { describe, expect, it, vi } from 'vitest'
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native'
import { motionPresets } from '@orbit/shared/theme'
import { OptionCard } from '@/components/ui/option-card'
import { createTokensV2 } from '@/lib/theme'

const preference = vi.hoisted(() => ({ reduced: false }))
vi.mock('@/lib/motion', async (importOriginal) => ({ ...await importOriginal<typeof import('@/lib/motion')>(), usePrefersReducedMotion: () => preference.reduced }))
vi.mock('@/lib/use-app-theme', () => ({ useAppTheme: () => ({ currentScheme: 'orange', currentTheme: 'dark' }) }))
vi.mock('@/components/ui/flow-look', () => ({ useFlowLook: () => ({ lookAtControl: vi.fn(), lookAway: vi.fn() }) }))
const TestRenderer = require('react-test-renderer')

const tokens = createTokensV2('orange', 'dark')

function hostStyle(tree: ReturnType<typeof TestRenderer.create>, testID: string) {
  return StyleSheet.flatten(tree.root.findAll((node: { type: unknown; props: { testID?: string } }) => typeof node.type === 'string' && node.props.testID === testID)[0]!.props.style)
}

describe('OptionCard selection on Android', () => {
  it('draws the primary ring over the card face when selected, takes no border on the face and settles the ring on the selection preset', () => {
    preference.reduced = false
    const { enterDuration, exitDuration, enterEasing, exitEasing } = motionPresets.selection
    let tree: ReturnType<typeof TestRenderer.create>
    const render = (selected: boolean) => <OptionCard label="Saúde" selected={selected} onSelect={vi.fn()} />
    TestRenderer.act(() => { tree = TestRenderer.create(render(false)) })
    const bordered = tree!.root.findAll((node: { type: unknown; props: { testID?: string; style?: StyleProp<ViewStyle> } }) => typeof node.type === 'string' && node.props.testID !== 'selection-ring' && (StyleSheet.flatten(node.props.style).borderWidth ?? 0) > 0)
    expect(bordered).toHaveLength(0)
    expect(hostStyle(tree, 'selection-ring')).toMatchObject({ position: 'absolute', borderColor: 'transparent', transition: `border-color ${exitDuration}ms cubic-bezier(${exitEasing.join(',')})` })
    TestRenderer.act(() => tree!.update(render(true)))
    expect(hostStyle(tree, 'selection-ring')).toMatchObject({ position: 'absolute', borderWidth: 2, borderColor: tokens.primary, transition: `border-color ${enterDuration}ms cubic-bezier(${enterEasing.join(',')})` })
    TestRenderer.act(() => tree!.unmount())
  })

  it('swaps the ring at once under reduced motion', () => {
    preference.reduced = true
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = TestRenderer.create(<OptionCard label="Saúde" selected onSelect={vi.fn()} />) })
    expect(hostStyle(tree, 'selection-ring')).toMatchObject({ borderWidth: 2, borderColor: tokens.primary, transition: 'none' })
    TestRenderer.act(() => tree!.unmount())
    preference.reduced = false
  })
})

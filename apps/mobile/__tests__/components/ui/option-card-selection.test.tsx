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

  it('keeps the primary ring of a selected card under keyboard focus, directly inside the focus ring', () => {
    preference.reduced = false
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = TestRenderer.create(<OptionCard label="Saúde" selected onSelect={vi.fn()} />) })
    const card = tree!.root.findAll((node: { type: unknown; props: { testID?: string } }) => typeof node.type !== 'string' && node.props.testID === 'option-card' && typeof (node.props as { onFocus?: unknown }).onFocus === 'function').at(-1)!
    const target = {}
    TestRenderer.act(() => { card.props.onFocus({ target, currentTarget: target }) })
    expect(hostStyle(tree, 'option-card')).toMatchObject({ outlineWidth: 2, outlineOffset: -4, outlineStyle: 'solid', outlineColor: tokens.fg1 })
    expect(hostStyle(tree, 'selection-ring')).toMatchObject({ top: 4, right: 4, bottom: 4, left: 4, borderWidth: 2, borderColor: tokens.primary })
    TestRenderer.act(() => { card.props.onBlur({ target, currentTarget: target }) })
    expect(hostStyle(tree, 'option-card').outlineWidth).toBeUndefined()
    expect(hostStyle(tree, 'selection-ring')).toMatchObject({ top: 0, right: 0, bottom: 0, left: 0, borderWidth: 2, borderColor: tokens.primary })
    TestRenderer.act(() => tree!.unmount())
  })

  it.each(['America/North_Dakota/New_Salem', 'America/Argentina/Rio_Gallegos'])('holds a wide option on one line with a tail ellipsis, and keeps the full name as its accessible name: %s', (zone) => {
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = TestRenderer.create(<OptionCard wide label={zone} onSelect={vi.fn()} />) })
    const text = tree!.root.findAll((node: { type: unknown; props: { children?: unknown } }) => node.type === 'Text' && node.props.children === zone)[0]!
    expect(text.props).toMatchObject({ numberOfLines: 1, ellipsizeMode: 'tail' })
    expect(tree!.root.findAll((node: { type: unknown; props: { testID?: string } }) => typeof node.type === 'string' && node.props.testID === 'option-card')[0]!.props.accessibilityLabel).toBe(zone)
    TestRenderer.act(() => tree!.unmount())
  })

  it('lets a short option take a second line', () => {
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = TestRenderer.create(<OptionCard label="Saúde" onSelect={vi.fn()} />) })
    expect(tree!.root.findAll((node: { type: unknown; props: { children?: unknown } }) => node.type === 'Text' && node.props.children === 'Saúde')[0]!.props.numberOfLines).toBe(2)
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

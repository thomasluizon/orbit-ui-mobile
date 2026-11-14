import { describe, expect, it, vi } from 'vitest'
import { StyleSheet } from 'react-native'
import { motionPresets } from '@orbit/shared/theme'
import { OptionCard } from '@/components/ui/option-card'
import { PRESS_SCALE_TRANSITION } from '@/components/motion/press-scale'
import { createTokensV2 } from '@/lib/theme'

const preference = vi.hoisted(() => ({ reduced: false }))
vi.mock('@/lib/motion', async (importOriginal) => ({ ...await importOriginal<typeof import('@/lib/motion')>(), usePrefersReducedMotion: () => preference.reduced }))
vi.mock('@/lib/use-app-theme', () => ({ useAppTheme: () => ({ currentScheme: 'orange', currentTheme: 'dark' }) }))
vi.mock('@/components/ui/flow-look', () => ({ useFlowLook: () => ({ lookAtControl: vi.fn(), lookAway: vi.fn() }) }))
const TestRenderer = require('react-test-renderer')

const tokens = createTokensV2('orange', 'dark')

function cardStyle(tree: ReturnType<typeof TestRenderer.create>) {
  return StyleSheet.flatten(tree.root.findByProps({ testID: 'option-card' }).findAll((node: { type: unknown }) => typeof node.type === 'string')[0]!.props.style)
}

describe('OptionCard selection on Android', () => {
  it('draws the primary ring inside its fixed border when selected and settles it on the selection preset', () => {
    preference.reduced = false
    const { enterDuration, exitDuration, enterEasing, exitEasing } = motionPresets.selection
    let tree: ReturnType<typeof TestRenderer.create>
    const render = (selected: boolean) => <OptionCard label="Saúde" selected={selected} onSelect={vi.fn()} />
    TestRenderer.act(() => { tree = TestRenderer.create(render(false)) })
    expect(cardStyle(tree)).toMatchObject({ borderWidth: 2, borderColor: 'transparent', transition: `${PRESS_SCALE_TRANSITION}, border-color ${exitDuration}ms cubic-bezier(${exitEasing.join(',')})` })
    TestRenderer.act(() => tree!.update(render(true)))
    expect(cardStyle(tree)).toMatchObject({ borderWidth: 2, borderColor: tokens.primary, transition: `${PRESS_SCALE_TRANSITION}, border-color ${enterDuration}ms cubic-bezier(${enterEasing.join(',')})` })
    TestRenderer.act(() => tree!.unmount())
  })

  it('swaps the ring at once under reduced motion', () => {
    preference.reduced = true
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = TestRenderer.create(<OptionCard label="Saúde" selected onSelect={vi.fn()} />) })
    expect(cardStyle(tree)).toMatchObject({ borderColor: tokens.primary, transition: 'none' })
    TestRenderer.act(() => tree!.unmount())
    preference.reduced = false
  })
})

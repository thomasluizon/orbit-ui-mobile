import { Animated, Text } from 'react-native'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { motionDurations } from '@orbit/shared/theme'
import { OrbitHop } from '@/components/ui/orbit-hop'

const motion = vi.hoisted(() => ({ reduced: false }))
vi.mock('@/lib/motion', async (importOriginal) => ({ ...await importOriginal<typeof import('@/lib/motion')>(), usePrefersReducedMotion: () => motion.reduced }))

const TestRenderer = require('react-test-renderer')

function mount(active: boolean) {
  let tree!: ReturnType<typeof TestRenderer.create>
  TestRenderer.act(() => { tree = TestRenderer.create(<OrbitHop active={active} testID="hop"><Text>Orbit</Text></OrbitHop>) })
  return tree
}
const carrier = (tree: ReturnType<typeof TestRenderer.create>) => tree.root.findAll((node: { type: unknown; props: Record<string, unknown> }) => typeof node.type === 'string' && node.props.testID === 'hop')[0]!

afterEach(() => { motion.reduced = false; vi.restoreAllMocks() })

describe('the one hop of Orbit on Android', () => {
  it('rises and returns one time over the slow duration, hidden from assistive technology', () => {
    const timing = vi.spyOn(Animated, 'timing')
    const tree = mount(true)
    expect(carrier(tree).props).toMatchObject({ 'data-orbit-hop': 'play', importantForAccessibility: 'no-hide-descendants', accessibilityElementsHidden: true })
    expect(timing.mock.calls.map(([, config]) => [config.toValue, config.duration])).toEqual([[-12, motionDurations.slow / 2], [0, motionDurations.slow / 2]])
  })

  it('starts no motion when it is not active', () => {
    const timing = vi.spyOn(Animated, 'timing')
    expect(carrier(mount(false)).props['data-orbit-hop']).toBe('still')
    expect(timing).not.toHaveBeenCalled()
  })

  it('starts no motion under reduced motion', () => {
    motion.reduced = true
    const timing = vi.spyOn(Animated, 'timing')
    expect(carrier(mount(true)).props['data-orbit-hop']).toBe('still')
    expect(timing).not.toHaveBeenCalled()
  })
})

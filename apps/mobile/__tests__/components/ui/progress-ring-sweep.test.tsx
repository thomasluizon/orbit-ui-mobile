import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer'
import { Animated } from 'react-native'
import { describe, expect, it, vi } from 'vitest'
import { motionDurations } from '@orbit/shared/theme'
import { ProgressRing } from '@/components/ui/progress-ring'

vi.mock('@/lib/motion', async (importOriginal) => ({ ...await importOriginal<typeof import('@/lib/motion')>(), usePrefersReducedMotion: () => false }))

function measure(tree: ReactTestRenderer) {
  const svg = tree.root.findAll((node: ReactTestInstance) => String(node.type) === 'Svg')[0]!
  void act(() => { (svg.props.onLayout as () => void)() })
}

describe('ProgressRing sweep duration on Android', () => {
  it.each([[undefined, motionDurations.base], ['base' as const, motionDurations.base], ['slow' as const, motionDurations.slow]])('moves the stroke with sweep %s in %d ms', (sweepDuration, duration) => {
    const timing = vi.spyOn(Animated, 'timing').mockImplementation(() => ({ reset: vi.fn(), start: vi.fn(), stop: vi.fn() }))
    let tree!: ReactTestRenderer
    void act(() => { tree = create(<ProgressRing value={20} label="Progress" sweepDuration={sweepDuration} />) })
    measure(tree)
    void act(() => { tree.update(<ProgressRing value={60} label="Progress" sweepDuration={sweepDuration} />) })
    expect(timing).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ duration }))
    void act(() => { tree.unmount() })
    timing.mockRestore()
  })
})

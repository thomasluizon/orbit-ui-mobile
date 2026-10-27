import { describe, expect, it, vi } from 'vitest'
import { LayoutAnimation } from 'react-native'
import { createListCellMotion, useListLayoutMotion } from '@/lib/list-motion'
import { motionDurations, motionSprings } from '@orbit/shared/theme'
import { Keyframe } from '../../test-mocks/react-native-reanimated'

const preference = vi.hoisted(() => ({ reduced: false }))
vi.mock('@/lib/motion', () => ({ usePrefersReducedMotion: () => preference.reduced }))
const TestRenderer = require('react-test-renderer')
function List({ ids, dragging = false }: Readonly<{ ids: string; dragging?: boolean }>) {
  useListLayoutMotion(ids, dragging)
  return null
}

describe('list motion', () => {
  it('keeps the initial list static, settles changed rows and honours live reduced motion', () => {
    preference.reduced = false
    const configure = vi.spyOn(LayoutAnimation, 'configureNext')
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = TestRenderer.create(<List ids="one,two" />) })
    expect(configure).not.toHaveBeenCalled()
    TestRenderer.act(() => tree!.update(<List ids="two" />))
    expect(configure).toHaveBeenLastCalledWith(expect.objectContaining({ duration: motionDurations.base, delete: { type: 'easeInEaseOut', property: 'opacity' } }))
    preference.reduced = true
    TestRenderer.act(() => tree!.update(<List ids="two" />))
    expect(configure).toHaveBeenLastCalledWith(expect.objectContaining({ duration: 0 }))
    TestRenderer.act(() => tree!.unmount())
    configure.mockRestore()
  })

  it('leaves drag transforms with the cell and uses quiet, bounded entrance and exit motion', () => {
    const normal = createListCellMotion(false)
    expect(normal.animationConfig).toMatchObject({ ...motionSprings.soft, overshootClamping: true })
    expect((normal.itemEnteringAnimation as unknown as Keyframe).definitions[0]).toMatchObject({ opacity: 0, transform: [{ translateY: 12 }] })
    const reduced = createListCellMotion(true)
    expect((reduced.itemEnteringAnimation as unknown as Keyframe).definitions[0]).toMatchObject({ transform: [{ translateY: 0 }] })
    expect((reduced.itemExitingAnimation as unknown as Keyframe).durationMs).toBe(0)
  })
})

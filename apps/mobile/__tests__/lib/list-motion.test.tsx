import { describe, expect, it, vi } from 'vitest'
import { useState } from 'react'
import { LayoutAnimation } from 'react-native'
import { createListCellMotion, prepareListLayoutMotion, useListLayoutMotion } from '@/lib/list-motion'
import { motionDurations, motionSprings } from '@orbit/shared/theme'
import { Keyframe } from '../../test-mocks/react-native-reanimated'

const preference = vi.hoisted(() => ({ reduced: false }))
vi.mock('@/lib/motion', () => ({ usePrefersReducedMotion: () => preference.reduced }))
const TestRenderer = require('react-test-renderer')
function List({ dragging = false, source = 'habits' }: Readonly<{ dragging?: boolean; source?: 'habits' | 'goals' }>) {
  useListLayoutMotion(source, dragging)
  return null
}

function ChangingList({ beforeSet }: Readonly<{ beforeSet: () => void }>) {
  const [ids, setIds] = useState('one,two')
  useListLayoutMotion('habits')
  return <button onClick={() => { prepareListLayoutMotion('habits'); beforeSet(); setIds('two') }}>{ids}</button>
}

describe('list motion', () => {
  it('configures the next layout before the list state setter runs', () => {
    preference.reduced = false
    const configure = vi.spyOn(LayoutAnimation, 'configureNext')
    const beforeSet = vi.fn(() => expect(configure).toHaveBeenCalledOnce())
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = TestRenderer.create(<ChangingList beforeSet={beforeSet} />) })
    try {
      TestRenderer.act(() => tree!.root.findByType('button').props.onClick())
      expect(tree!.root.findByType('button').props.children).toBe('two')
    } finally {
      TestRenderer.act(() => tree!.unmount())
      configure.mockRestore()
    }
  })

  it('keeps the initial list static, settles changed rows and honours live reduced motion', () => {
    preference.reduced = false
    const configure = vi.spyOn(LayoutAnimation, 'configureNext')
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = TestRenderer.create(<List />) })
    expect(configure).not.toHaveBeenCalled()
    prepareListLayoutMotion('habits')
    expect(configure).toHaveBeenLastCalledWith(expect.objectContaining({ duration: motionDurations.base, delete: { type: 'easeInEaseOut', property: 'opacity' } }))
    preference.reduced = true
    TestRenderer.act(() => tree!.update(<List />))
    prepareListLayoutMotion('habits')
    expect(configure).toHaveBeenLastCalledWith(expect.objectContaining({ duration: 0 }))
    TestRenderer.act(() => tree!.unmount())
    configure.mockRestore()
  })

  it('excludes drag updates and unrelated or unmounted lists', () => {
    preference.reduced = false
    const configure = vi.spyOn(LayoutAnimation, 'configureNext')
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = TestRenderer.create(<List dragging />) })
    prepareListLayoutMotion('habits')
    expect(configure).not.toHaveBeenCalled()
    TestRenderer.act(() => tree!.update(<List />))
    prepareListLayoutMotion('goals')
    expect(configure).not.toHaveBeenCalled()
    prepareListLayoutMotion('habits')
    expect(configure).toHaveBeenCalledOnce()
    TestRenderer.act(() => tree!.unmount())
    prepareListLayoutMotion('habits')
    expect(configure).toHaveBeenCalledOnce()
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

import { describe, expect, it } from 'vitest'

import { ProgressBar } from '@/components/ui/progress-bar'

const TestRenderer = require('react-test-renderer')

function renderBar(progress: number, label = 'Progress') {
  let tree: any
  TestRenderer.act(() => {
    tree = TestRenderer.create(<ProgressBar value={progress} max={1} label={label} />)
  })
  return tree
}

function findTrack(tree: any) {
  return tree.root.find((node: any) => node.props.accessibilityRole === 'progressbar')
}

describe('ProgressBar (mobile)', () => {
  it('exposes progress through accessibility props', async () => {
    const tree = await renderBar(0.5, 'Daily progress')
    const track = findTrack(tree)
    expect(track.props.accessibilityLabel).toBe('Daily progress')
    expect(track.props.accessibilityValue).toEqual({ min: 0, max: 1, now: 0.5 })
  })

  it('clamps progress above 1', async () => {
    const tree = await renderBar(1.5)
    expect(findTrack(tree).props.accessibilityValue.now).toBe(1)
  })

  it('clamps progress below 0', async () => {
    const tree = await renderBar(-0.5)
    expect(findTrack(tree).props.accessibilityValue.now).toBe(0)
  })

  it('uses accent while unfinished and neutral at completion', async () => {
    const unfinished = await renderBar(0.5)
    const unfinishedFill = unfinished.root.findByType('AnimatedView')
    const unfinishedColor = unfinishedFill.props.style[1].backgroundColor

    const complete = await renderBar(1)
    const completeFill = complete.root.findByType('AnimatedView')
    expect(completeFill.props.style[1].backgroundColor).not.toBe(unfinishedColor)
  })
})

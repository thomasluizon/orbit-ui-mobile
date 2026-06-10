import { describe, expect, it } from 'vitest'

import { ProgressBar } from '@/components/ui/progress-bar'

const TestRenderer = require('react-test-renderer')

async function renderBar(progress: number, label = 'Progress') {
  let tree: any
  await TestRenderer.act(async () => {
    tree = TestRenderer.create(<ProgressBar progress={progress} label={label} />)
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
    expect(track.props.accessibilityValue).toEqual({ min: 0, max: 100, now: 50 })
  })

  it('clamps progress above 1', async () => {
    const tree = await renderBar(1.5)
    expect(findTrack(tree).props.accessibilityValue.now).toBe(100)
  })

  it('clamps progress below 0', async () => {
    const tree = await renderBar(-0.5)
    expect(findTrack(tree).props.accessibilityValue.now).toBe(0)
  })
})

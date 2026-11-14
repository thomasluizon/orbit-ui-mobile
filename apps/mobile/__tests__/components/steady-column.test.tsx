import React from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { SteadyColumn, steadyLength } from '@/components/auth/steady-column'
import { __resetTestHostConfig, __setMeasureInWindowImpl, __setWindowDimensions } from '../../test-mocks/react-native'

const { act, create } = require('react-test-renderer')

/** The 420 dpi proof emulator: one device pixel is 1 / 2.625 dp. */
const PIXEL_RATIO = 2.625
const VIEWPORT = 1452 / PIXEL_RATIO
const BLOCK = 233 / PIXEL_RATIO
const OUTER_TOP_PX = 0.25
const RAW_COLUMN_PX = 1437.6

type Tree = { toJSON: () => { props: { style: { paddingTop: number } } } | null; unmount: () => void; update: (element: React.ReactElement) => void }

function column() {
  return <SteadyColumn viewportHeight={VIEWPORT} blockSpace={BLOCK} style={null}><React.Fragment /></SteadyColumn>
}

/** The height Yoga sets: the snapped bottom edge minus the snapped top edge, both from the absolute position. */
function snappedColumnHeight(inset: number) {
  const top = OUTER_TOP_PX + inset * PIXEL_RATIO
  return (Math.round(top + RAW_COLUMN_PX) - Math.round(top)) / PIXEL_RATIO
}

function renderColumn() {
  let tree: Tree | undefined
  const measuredHeights: number[] = []
  __setWindowDimensions({ width: 360, height: 800, scale: PIXEL_RATIO, fontScale: 1 })
  __setMeasureInWindowImpl((callback, props) => {
    if (props.testID !== 'login-column') return callback(0, 0, 0, 0)
    const height = snappedColumnHeight(tree?.toJSON()?.props.style.paddingTop ?? 0)
    measuredHeights.push(Math.round(height * PIXEL_RATIO))
    return callback(0, 0, 328, height)
  })
  act(() => {
    tree = create(column())
  })
  return { tree: tree as Tree, measuredHeights }
}

describe('SteadyColumn', () => {
  afterEach(() => {
    __resetTestHostConfig()
  })

  it('settles when a half-pixel inset moves the snapped column height by one device pixel', () => {
    const { tree, measuredHeights } = renderColumn()

    const inset = tree.toJSON()?.props.style.paddingTop ?? -1
    expect(measuredHeights.length).toBeLessThan(10)
    const insetErrorPx = Math.abs(inset - (VIEWPORT - snappedColumnHeight(inset) + BLOCK) / 2) * PIXEL_RATIO
    expect(Number(insetErrorPx.toFixed(6))).toBeLessThanOrEqual(0.5)
    act(() => tree.update(column()))
    expect(tree.toJSON()?.props.style.paddingTop).toBe(inset)
    act(() => tree.unmount())
  })
})

describe('steadyLength', () => {
  it.each([
    [0, 547.4286, 547.4286],
    [547.4286, 547.8095, 547.4286],
    [547.4286, 547.0476, 547.4286],
    [547.4286, 548.1905, 548.1905],
    [88.7619, 0, 0],
  ])('keeps %s when the measurement is %s unless it moved by more than one pixel', (current, measured, kept) => {
    expect(steadyLength(current, measured, PIXEL_RATIO)).toBe(kept)
  })
})

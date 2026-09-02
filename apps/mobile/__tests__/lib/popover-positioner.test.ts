import { describe, expect, it } from 'vitest'
import {
  DEFAULT_POPOVER_EDGE_GAP,
  FALLBACK_POPOVER_TOP_INSET,
  getFallbackPopoverAnchorRect,
  getPopoverPosition,
} from '@/lib/popover-positioner'

describe('popover positioning', () => {
  it('right-aligns the popover to the anchor by default', () => {
    const position = getPopoverPosition({
      anchorRect: { x: 300, y: 100, width: 24, height: 24 },
      viewportWidth: 400,
      viewportHeight: 800,
      popoverWidth: 200,
      popoverHeight: 180,
    })

    expect(position).toEqual({ left: 124, top: 132, opensUp: false })
  })

  it('clamps the popover within the viewport edges', () => {
    const position = getPopoverPosition({
      anchorRect: { x: 8, y: 120, width: 24, height: 24 },
      viewportWidth: 240,
      viewportHeight: 640,
      popoverWidth: 220,
      popoverHeight: 180,
    })

    expect(position.left).toBe(DEFAULT_POPOVER_EDGE_GAP)
    expect(position.top).toBe(152)
    expect(position.opensUp).toBe(false)
  })

  it('flips above at a forcing viewport height', () => {
    const position = getPopoverPosition({
      anchorRect: { x: 260, y: 580, width: 24, height: 24 },
      viewportWidth: 360,
      viewportHeight: 640,
      popoverWidth: 200,
      popoverHeight: 180,
    })

    expect(position).toEqual({ left: 84, top: 392, opensUp: true })
  })

  it('provides a top-right fallback anchor', () => {
    expect(getFallbackPopoverAnchorRect(412)).toEqual({
      x: 412 - DEFAULT_POPOVER_EDGE_GAP,
      y: FALLBACK_POPOVER_TOP_INSET,
      width: 0,
      height: 0,
    })
  })
})

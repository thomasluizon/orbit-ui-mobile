import { describe, expect, it } from 'vitest'
import {
  DEFAULT_ANCHORED_MENU_MARGIN,
  FALLBACK_ANCHOR_TOP_INSET,
  getAnchoredMenuPosition,
  getFallbackAnchorRect,
} from '@/lib/anchored-menu'

describe('anchored menu positioning', () => {
  it('right-aligns the menu to the anchor by default', () => {
    const position = getAnchoredMenuPosition({
      anchorRect: { x: 300, y: 100, width: 24, height: 24 },
      viewportWidth: 400,
      viewportHeight: 800,
      menuWidth: 200,
      menuHeight: 180,
    })

    expect(position).toEqual({
      left: 124,
      top: 132,
      opensUp: false,
    })
  })

  it('clamps the menu within the viewport edges', () => {
    const position = getAnchoredMenuPosition({
      anchorRect: { x: 8, y: 120, width: 24, height: 24 },
      viewportWidth: 240,
      viewportHeight: 640,
      menuWidth: 220,
      menuHeight: 180,
    })

    expect(position.left).toBe(DEFAULT_ANCHORED_MENU_MARGIN)
    expect(position.top).toBe(152)
    expect(position.opensUp).toBe(false)
  })

  it('opens upward when there is not enough room below the trigger', () => {
    const position = getAnchoredMenuPosition({
      anchorRect: { x: 260, y: 580, width: 24, height: 24 },
      viewportWidth: 360,
      viewportHeight: 640,
      menuWidth: 200,
      menuHeight: 180,
    })

    expect(position.left).toBe(84)
    expect(position.top).toBe(392)
    expect(position.opensUp).toBe(true)
  })
})

describe('anchored menu fallback anchor', () => {
  it('places a zero-size anchor at the top-right inset', () => {
    expect(getFallbackAnchorRect(412)).toEqual({
      x: 412 - DEFAULT_ANCHORED_MENU_MARGIN,
      y: FALLBACK_ANCHOR_TOP_INSET,
      width: 0,
      height: 0,
    })
  })

  it('positions a menu against the top-right corner when no rect was measured', () => {
    const window = { width: 412, height: 892 }
    const position = getAnchoredMenuPosition({
      anchorRect: getFallbackAnchorRect(window.width),
      viewportWidth: window.width,
      viewportHeight: window.height,
      menuWidth: 208,
      menuHeight: 296,
    })

    expect(position.left).toBe(
      window.width - 208 - DEFAULT_ANCHORED_MENU_MARGIN,
    )
    expect(position.top).toBe(FALLBACK_ANCHOR_TOP_INSET + DEFAULT_ANCHORED_MENU_MARGIN)
    expect(position.opensUp).toBe(false)
  })
})

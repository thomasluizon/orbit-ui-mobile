import { describe, expect, it } from 'vitest'
import {
  DEFAULT_ANCHORED_MENU_MARGIN,
  getAnchoredMenuPosition,
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

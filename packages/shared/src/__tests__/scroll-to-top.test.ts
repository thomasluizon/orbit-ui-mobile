import { describe, expect, it } from 'vitest'
import { updateScrollToTopState } from '../utils/scroll-to-top'

describe('Hoje scroll-to-top visibility', () => {
  it('requires upward motion beyond one viewport and hides on downward motion or at the top', () => {
    let state = { offset: 0, visible: false }
    const scroll = (offset: number) => { state = updateScrollToTopState(state, offset, 500); return state.visible }
    expect(scroll(900)).toBe(false)
    expect(scroll(700)).toBe(true)
    expect(scroll(700)).toBe(true)
    expect(scroll(800)).toBe(false)
    expect(scroll(600)).toBe(true)
    expect(scroll(500)).toBe(false)
    expect(scroll(400)).toBe(false)
    expect(scroll(0)).toBe(false)
    expect(scroll(-20)).toBe(false)
  })

  it('does not show before the scroller has a measured viewport', () => {
    expect(updateScrollToTopState({ offset: 900, visible: false }, 700, 0).visible).toBe(false)
  })
})

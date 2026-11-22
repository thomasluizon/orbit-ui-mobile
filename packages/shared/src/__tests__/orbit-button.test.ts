import { afterEach, describe, expect, it, vi } from 'vitest'
import { ORBIT_BUTTON_GAP, ORBIT_STACK_CLEARANCE } from '../utils/orbit-button'
import { FAB_SIZE } from '../theme/button'

afterEach(() => {
  vi.doUnmock('../theme/spacing')
  vi.resetModules()
})

describe('the stacked Orbit clearance', () => {
  it('reserves the 16px column inset, both buttons, the gap between them and the 16px row gap', () => {
    expect(ORBIT_STACK_CLEARANCE).toBe(16 + FAB_SIZE + ORBIT_BUTTON_GAP + FAB_SIZE + 16)
    expect(ORBIT_STACK_CLEARANCE).toBe(176)
  })

  it('follows a change to the gap between the buttons', async () => {
    vi.resetModules()
    vi.doMock('../theme/spacing', async importOriginal => {
      const actual = await importOriginal<typeof import('../theme/spacing')>()
      return { ...actual, SPACING: { ...actual.SPACING, s24: 40 } }
    })
    const widened = await import('../utils/orbit-button')
    expect(widened.ORBIT_BUTTON_GAP).toBe(40)
    expect(widened.ORBIT_STACK_CLEARANCE - ORBIT_STACK_CLEARANCE).toBe(widened.ORBIT_BUTTON_GAP - ORBIT_BUTTON_GAP)
  })
})

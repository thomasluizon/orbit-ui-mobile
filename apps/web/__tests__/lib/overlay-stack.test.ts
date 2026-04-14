import { describe, expect, it, vi } from 'vitest'
import {
  dismissTopOverlay,
  isTopOverlay,
  registerOverlay,
  unregisterOverlay,
} from '@/lib/overlay-stack'

describe('web overlay stack', () => {
  it('returns false when there is no overlay to dismiss', () => {
    expect(dismissTopOverlay('navigation')).toBe(false)
  })

  it('dismisses the top overlay and preserves the stack underneath it', () => {
    const firstDismiss = vi.fn()
    const secondDismiss = vi.fn()

    registerOverlay({ id: 'first', dismiss: firstDismiss })
    registerOverlay({ id: 'second', dismiss: secondDismiss })

    expect(isTopOverlay('second')).toBe(true)
    expect(dismissTopOverlay('close-button')).toBe(true)
    expect(secondDismiss).toHaveBeenCalledWith('close-button')

    unregisterOverlay('second')
    expect(isTopOverlay('first')).toBe(true)
    unregisterOverlay('first')
  })

  it('replaces existing entries when the same id is registered again', () => {
    const originalDismiss = vi.fn()
    const replacementDismiss = vi.fn()

    registerOverlay({ id: 'shared', dismiss: originalDismiss })
    registerOverlay({ id: 'shared', dismiss: replacementDismiss })

    dismissTopOverlay('system-back')

    expect(originalDismiss).not.toHaveBeenCalled()
    expect(replacementDismiss).toHaveBeenCalledWith('system-back')

    unregisterOverlay('shared')
  })
})

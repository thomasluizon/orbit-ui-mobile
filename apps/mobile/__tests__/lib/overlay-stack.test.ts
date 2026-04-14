import { describe, expect, it, vi } from 'vitest'

async function loadOverlayStackModule() {
  vi.resetModules()
  return import('@/lib/overlay-stack')
}

describe('mobile overlay stack', () => {
  it('returns false when there is no overlay to dismiss', async () => {
    const { dismissTopOverlay } = await loadOverlayStackModule()
    expect(dismissTopOverlay('navigation')).toBe(false)
  })

  it('dismisses the most recently registered overlay', async () => {
    const {
      dismissTopOverlay,
      isTopOverlay,
      registerOverlay,
      unregisterOverlay,
    } = await loadOverlayStackModule()

    const firstDismiss = vi.fn(() => true)
    const secondDismiss = vi.fn(() => true)

    registerOverlay({ id: 'first', dismiss: firstDismiss })
    registerOverlay({ id: 'second', dismiss: secondDismiss })

    expect(isTopOverlay('second')).toBe(true)
    expect(dismissTopOverlay('close-button')).toBe(true)
    expect(secondDismiss).toHaveBeenCalledWith('close-button')

    unregisterOverlay('second')
    expect(isTopOverlay('first')).toBe(true)
  })

  it('replaces existing overlays that reuse the same id', async () => {
    const { dismissTopOverlay, registerOverlay } = await loadOverlayStackModule()

    const originalDismiss = vi.fn(() => true)
    const replacementDismiss = vi.fn(() => true)

    registerOverlay({ id: 'shared', dismiss: originalDismiss })
    registerOverlay({ id: 'shared', dismiss: replacementDismiss })

    expect(dismissTopOverlay('system-back')).toBe(true)
    expect(originalDismiss).not.toHaveBeenCalled()
    expect(replacementDismiss).toHaveBeenCalledWith('system-back')
  })
})

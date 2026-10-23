import { describe, expect, it, vi } from 'vitest'
import { createMenuOwnership } from '../hooks/menu-state-core'

describe('menu ownership', () => {
  it('dismisses the previous menu and prevents its focus return until the replacement closes', () => {
    const first = createMenuOwnership()
    const second = createMenuOwnership()
    const dismissFirst = vi.fn()
    const releaseFirst = first.claim(dismissFirst)
    expect(first.canRestoreFocus()).toBe(true)
    expect(second.canRestoreFocus()).toBe(false)
    const releaseSecond = second.claim(vi.fn())
    expect(dismissFirst).toHaveBeenCalledOnce()
    expect(first.canRestoreFocus()).toBe(false)
    expect(second.canRestoreFocus()).toBe(true)
    releaseFirst()
    expect(first.canRestoreFocus()).toBe(false)
    releaseSecond()
    expect(first.canRestoreFocus()).toBe(true)
    expect(second.canRestoreFocus()).toBe(true)
  })

  it('rejects a stale close after reopening the same menu', () => {
    const owner = createMenuOwnership()
    const firstOpening = owner.reopen()
    expect(owner.isCurrentRevision(firstOpening)).toBe(true)
    const secondOpening = owner.reopen()
    expect(owner.isCurrentRevision(firstOpening)).toBe(false)
    expect(owner.isCurrentRevision(secondOpening)).toBe(true)
    const release = owner.claim(vi.fn())
    release()
    release()
    expect(owner.canRestoreFocus()).toBe(true)
  })
})

import { describe, expect, it, vi } from 'vitest'
import { createMenuOwnership, createUseMenuState } from '../hooks/menu-state-core'
import { createHookStateHarness } from '../test-support/hook-state'

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

function menuHarness() {
  const state = createHookStateHarness()
  const effects: (() => void)[] = []
  const cleanups = new Set<() => void>()
  const useMenuState = createUseMenuState({
    useState: state.useState,
    useCallback: (callback) => callback,
    useMemo: (factory) => factory(),
    useEffectEvent: (callback) => {
      const [latest] = state.useState(() => ({ callback }))
      latest.callback = callback
      return () => latest.callback()
    },
    useEffect: (effect, dependencies) => {
      const [slot] = state.useState<{ dependencies?: readonly unknown[]; cleanup?: () => void }>({})
      if (slot.dependencies?.every((value, index) => Object.is(value, dependencies[index]))) return
      slot.dependencies = dependencies
      effects.push(() => {
        if (slot.cleanup) { slot.cleanup(); cleanups.delete(slot.cleanup) }
        slot.cleanup = effect() ?? undefined
        if (slot.cleanup) cleanups.add(slot.cleanup)
      })
    },
  })
  return {
    render: (open?: boolean, onOpenChange?: (open: boolean) => void) => {
      const result = state.render(() => useMenuState(open, onOpenChange))
      effects.splice(0).forEach((effect) => effect())
      return result
    },
    unmount: () => cleanups.forEach((cleanup) => cleanup()),
  }
}

describe('shared menu state adapter', () => {
  it('opens and closes an uncontrolled menu and rejects an earlier opening\'s close', () => {
    const menu = menuHarness()
    const changed = vi.fn()
    try {
      expect(menu.render(undefined, changed).open).toBe(false)
      menu.render(undefined, changed).changeOpen(true)
      const previous = menu.render(undefined, changed)
      expect(previous.open).toBe(true)
      previous.close()
      expect(menu.render(undefined, changed).open).toBe(false)
      menu.render(undefined, changed).changeOpen(true)
      expect(menu.render(undefined, changed).open).toBe(true)
      previous.close()
      expect(menu.render(undefined, changed).open).toBe(true)
      menu.render(undefined, changed).close()
      expect(menu.render(undefined, changed).open).toBe(false)
      expect(changed.mock.calls).toEqual([[true], [false], [true], [false]])
    } finally { menu.unmount() }
  })

  it('suppresses a controlled menu replaced by another owner until its owner opens it again', () => {
    const first = menuHarness()
    const second = menuHarness()
    const initialChange = vi.fn()
    const currentChange = vi.fn()
    try {
      expect(first.render(true, initialChange).open).toBe(true)
      first.render(true, currentChange)
      second.render().changeOpen(true)
      expect(second.render().open).toBe(true)
      expect(currentChange).toHaveBeenCalledExactlyOnceWith(false)
      expect(initialChange).not.toHaveBeenCalled()
      expect(first.render(true, currentChange).open).toBe(false)
      expect(first.render(true, currentChange).canRestoreFocus()).toBe(false)
      first.render(true, currentChange).changeOpen(true)
      expect(first.render(true, currentChange).open).toBe(true)
      expect(second.render().open).toBe(false)
      expect(first.render(true, currentChange).canRestoreFocus()).toBe(true)
      first.render(false, currentChange)
      expect(first.render(false, currentChange).open).toBe(false)
      first.render(true, currentChange)
      expect(first.render(true, currentChange).open).toBe(true)
    } finally { first.unmount(); second.unmount() }
  })
})

import { describe, expect, it, vi } from 'vitest'
import { notifyToastNavigation, subscribeToastNavigation } from '../hooks/toast-lifecycle-core'
import { createAppToastStoreState, type AppToastStore } from '../stores/app-toast-store'

function createQueue() {
  let state: AppToastStore
  const set = (updater: (current: AppToastStore) => Partial<AppToastStore>) => {
    state = { ...state, ...updater(state) }
  }
  state = createAppToastStoreState(set, () => state)
  return { get: () => state }
}

describe('shared toast queue', () => {
  it('replaces a neutral item without an action with a done item', () => {
    const { get } = createQueue()
    get().showInfo('Waiting')
    get().showSuccess('Saved')
    expect(get().currentToast?.toast).toMatchObject({ kind: 'done', message: 'Saved' })
    expect(get().queue).toEqual([])
  })

  it('keeps a neutral item with an action until that action runs', () => {
    const { get } = createQueue()
    const action = vi.fn()
    get().showQueued('Deleted', 'Undo', action)
    get().showSuccess('Saved')
    expect(get().currentToast?.toast.message).toBe('Deleted')
    expect(get().queue).toHaveLength(1)
    get().triggerAction()
    expect(action).toHaveBeenCalledOnce()
    expect(get().currentToast?.toast.message).toBe('Saved')
  })

  it('collapses identical messages without actions', () => {
    const { get } = createQueue()
    get().showInfo('Waiting')
    get().showInfo('Waiting')
    expect(get().currentToast?.toast.message).toBe('Waiting')
    expect(get().queue).toEqual([])
  })

  it('cleans up a discarded passive notice while keeping multiple pending undos', () => {
    const { get } = createQueue()
    const passiveDismiss = vi.fn()
    const firstUndoDismiss = vi.fn()
    const secondUndoDismiss = vi.fn()
    get().showQueued('Visible undo', 'Undo', vi.fn())
    get().showQueued('First pending undo', 'Undo', vi.fn(), firstUndoDismiss)
    get().showQueued('Passive notice', undefined, undefined, passiveDismiss)
    get().showQueued('Second pending undo', 'Undo', vi.fn(), secondUndoDismiss)

    expect(get().queue.map((item) => item.toast.message)).toEqual([
      'First pending undo', 'Second pending undo',
    ])
    expect(passiveDismiss).toHaveBeenCalledOnce()
    expect(firstUndoDismiss).not.toHaveBeenCalled()
    expect(secondUndoDismiss).not.toHaveBeenCalled()
  })

  it('cleans up a replaced current toast and a discarded passive queued toast', () => {
    const { get } = createQueue()
    const replaced = vi.fn()
    const discarded = vi.fn()
    get().showQueued('Passive current', undefined, undefined, replaced)
    get().showQueued('Visible undo', 'Undo', vi.fn())
    expect(replaced).toHaveBeenCalledOnce()

    get().showQueued('Passive queued', undefined, undefined, discarded)
    get().showQueued('New undo', 'Undo', vi.fn())
    expect(discarded).toHaveBeenCalledOnce()
    expect(get().queue.map((item) => item.toast.message)).toEqual(['New undo'])
  })
})

describe('shared action toast dismissal', () => {
  it('clears visible and queued actions on navigation and completes their dismissals once', () => {
    const { get } = createQueue()
    const undo = vi.fn()
    const dismissed = vi.fn()
    get().showQueued('Skipped', 'Undo', undo, dismissed)
    get().showQueued('Archived', 'Undo', undo, dismissed)
    const unsubscribe = subscribeToastNavigation(() => get().dismissAllToasts())
    try {
      notifyToastNavigation()
      expect(get().currentToast).toBeNull()
      expect(get().queue).toEqual([])
      expect(dismissed).toHaveBeenCalledTimes(2)
      expect(undo).not.toHaveBeenCalled()
      notifyToastNavigation()
      expect(dismissed).toHaveBeenCalledTimes(2)
    } finally {
      unsubscribe()
    }
  })

  it('dismisses a queued action by id without dismissing the visible action', () => {
    const { get } = createQueue()
    const dismissed = vi.fn()
    const undo = vi.fn()
    const visibleId = get().showQueued('Skipped', 'Undo', undo)
    const queuedId = get().showQueued('Deleted', 'Undo', undo, dismissed)
    get().dismissToast(queuedId)
    expect(get().currentToast?.id).toBe(visibleId)
    expect(get().queue).toEqual([])
    expect(dismissed).toHaveBeenCalledOnce()
    get().dismissToast(queuedId)
    expect(dismissed).toHaveBeenCalledOnce()
    expect(undo).not.toHaveBeenCalled()
  })

  it('advances from a completed success to a dismissible error', () => {
    const { get } = createQueue()
    get().showSuccess('Saved')
    get().showError('Unavailable', 'Dismiss')
    const toast = get().currentToast?.toast
    if (toast?.kind !== 'done') throw new Error('Expected success toast')
    toast.onDone()
    expect(get().currentToast?.toast.message).toBe('Unavailable')
    get().triggerAction()
    expect(get().currentToast).toBeNull()
    get().dismissToast()
    get().triggerAction()
  })

  it('rejects blank notices and preserves directly supplied toast actions', () => {
    const { get } = createQueue()
    expect(get().showError('   ')).toBeUndefined()
    get().showError('Unavailable')
    get().showToast({ kind: 'lost', message: ' Connection lost ', detail: 'Try again', actionLabel: 'Retry', onAction: () => get().dismissAllToasts() })
    expect(get().currentToast?.toast.message).toBe('Connection lost')
    get().showSuccess('Saved')
    expect(get().queue).toHaveLength(1)
    get().triggerAction()
    expect(get().currentToast).toBeNull()
    expect(get().queue).toEqual([])
  })
})

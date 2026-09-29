import { describe, expect, it, vi } from 'vitest'
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

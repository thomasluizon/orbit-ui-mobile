import { describe, expect, it, vi } from 'vitest'
import { createAppToastStoreState, type AppToastStore } from '../stores/app-toast-store'

function createQueue() {
  let state: AppToastStore
  const set = (updater: (current: AppToastStore) => Partial<AppToastStore>) => {
    state = { ...state, ...updater(state) }
  }
  state = createAppToastStoreState(set, () => state)
  return () => state
}

describe('shared toast queue', () => {
  it('replaces a neutral item without an action with a done item', () => {
    const get = createQueue()
    get().showInfo('Waiting')
    get().showSuccess('Saved')
    expect(get().currentToast?.toast).toMatchObject({ kind: 'done', message: 'Saved' })
    expect(get().queue).toEqual([])
  })

  it('keeps a neutral item with an action until that action runs', () => {
    const get = createQueue()
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
    const get = createQueue()
    get().showInfo('Waiting')
    get().showInfo('Waiting')
    expect(get().currentToast?.toast.message).toBe('Waiting')
    expect(get().queue).toEqual([])
  })
})

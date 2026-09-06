import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppToastStore } from '@/stores/app-toast-store'

const triggerHaptic = vi.hoisted(() => vi.fn(async () => {}))

vi.mock('@/lib/haptics', () => ({ triggerHaptic }))

describe('app toast store', () => {
  beforeEach(() => {
    triggerHaptic.mockClear()
    useAppToastStore.setState({ currentToast: null, queue: [] })
  })

  it('ignores empty messages and trims accepted feedback', () => {
    const store = useAppToastStore.getState()
    store.showToast({ kind: 'neutral', message: '   ' })
    expect(useAppToastStore.getState().currentToast).toBeNull()

    store.showToast({ kind: 'neutral', message: '  First  ' })
    expect(useAppToastStore.getState().currentToast?.toast).toMatchObject({
      kind: 'neutral',
      message: 'First',
    })
  })

  it('replaces persistent feedback while preserving removable feedback in order', () => {
    const store = useAppToastStore.getState()
    store.showSuccess('First')
    store.showError('Second')
    store.showSuccess('Third')

    expect(useAppToastStore.getState().currentToast?.toast.message).toBe('First')
    expect(useAppToastStore.getState().queue.map((item) => item.toast.message)).toEqual(['Third'])

    useAppToastStore.getState().dismissToast()
    expect(useAppToastStore.getState().currentToast?.toast.message).toBe('Third')
    expect(useAppToastStore.getState().queue).toEqual([])
  })

  it('advances queued to syncing to synced without stalling the host', () => {
    const store = useAppToastStore.getState()

    store.showQueued('Queued')
    expect(useAppToastStore.getState().currentToast?.toast.message).toBe('Queued')

    store.showInfo('Syncing')
    expect(useAppToastStore.getState().currentToast?.toast.message).toBe('Syncing')

    store.showSuccess('Synced')
    expect(useAppToastStore.getState().currentToast?.toast).toMatchObject({
      kind: 'done',
      message: 'Synced',
    })
    expect(useAppToastStore.getState().queue).toEqual([])
  })

  it('replaces an actionless error with the next toast', () => {
    const store = useAppToastStore.getState()

    store.showError('Could not save')
    store.showInfo('Back online')

    expect(useAppToastStore.getState().currentToast?.toast.message).toBe('Back online')
    expect(useAppToastStore.getState().queue).toEqual([])
  })

  it('adapts legacy helpers to the closed kinds', () => {
    const store = useAppToastStore.getState()
    store.showSuccess('Saved')
    store.showInfo('Fact')

    expect(useAppToastStore.getState().currentToast?.toast.kind).toBe('done')
    expect(useAppToastStore.getState().queue[0]?.toast.kind).toBe('neutral')
    expect(triggerHaptic).toHaveBeenCalledWith('success')
  })

  it('stores paired neutral actions and dismisses after the host triggers one', () => {
    const onAction = vi.fn()
    useAppToastStore.getState().showQueued('Queued', 'Undo', onAction)

    expect(useAppToastStore.getState().currentToast?.toast).toMatchObject({
      kind: 'neutral',
      actionLabel: 'Undo',
    })
    useAppToastStore.getState().triggerAction()
    expect(onAction).toHaveBeenCalledTimes(1)
    expect(useAppToastStore.getState().currentToast).toBeNull()
  })
  it.each(['neutral', 'lost'] as const)('preserves consecutive %s actions with identical messages', (kind) => {
    const firstUndo = vi.fn()
    const secondUndo = vi.fn()
    const store = useAppToastStore.getState()
    store.showToast({ kind, message: 'Deleted', actionLabel: 'Undo', onAction: firstUndo, ...(kind === 'lost' ? { detail: 'Restore it' } : {}) } as Parameters<typeof store.showToast>[0])
    store.showToast({ kind, message: 'Deleted', actionLabel: 'Undo', onAction: secondUndo, ...(kind === 'lost' ? { detail: 'Restore it' } : {}) } as Parameters<typeof store.showToast>[0])
    expect(useAppToastStore.getState().queue).toHaveLength(1)
    store.triggerAction()
    expect(firstUndo).toHaveBeenCalledTimes(1)
    expect(secondUndo).not.toHaveBeenCalled()
    store.triggerAction()
    expect(secondUndo).toHaveBeenCalledTimes(1)
    expect(useAppToastStore.getState().currentToast).toBeNull()
  })

  it('retains an action queued behind passive feedback with the same words', () => {
    const store = useAppToastStore.getState()
    const undo = vi.fn()
    store.showInfo('Deleted')
    store.showQueued('Deleted', 'Undo', undo)
    store.triggerAction()
    expect(undo).toHaveBeenCalledTimes(1)
  })

  it('refuses identical visible messages and queue-tail duplicates without limiting depth', () => {
    const store = useAppToastStore.getState()
    for (let index = 0; index < 20; index += 1) store.showSuccess('Saved')
    expect(useAppToastStore.getState().currentToast?.toast.message).toBe('Saved')
    expect(useAppToastStore.getState().queue).toEqual([])
    for (let index = 0; index < 20; index += 1) store.showSuccess('Another')
    expect(useAppToastStore.getState().queue).toHaveLength(1)
    store.showInfo('Another')
    expect(useAppToastStore.getState().queue).toHaveLength(2)
    store.dismissToast()
    expect(useAppToastStore.getState().currentToast?.toast.message).toBe('Another')
  })

})

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

  it('queues later feedback and promotes it in order', () => {
    const store = useAppToastStore.getState()
    store.showInfo('First')
    store.showError('Second')
    store.showSuccess('Third')

    expect(useAppToastStore.getState().currentToast?.toast.message).toBe('First')
    expect(useAppToastStore.getState().queue.map((item) => item.toast.message)).toEqual([
      'Second',
      'Third',
    ])

    useAppToastStore.getState().dismissToast()
    expect(useAppToastStore.getState().currentToast?.toast.message).toBe('Second')
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
})

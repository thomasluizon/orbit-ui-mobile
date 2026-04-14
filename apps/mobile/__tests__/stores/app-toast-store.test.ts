import { beforeEach, describe, expect, it, vi } from 'vitest'

const triggerHaptic = vi.hoisted(() => vi.fn(async () => {}))

vi.mock('@/lib/haptics', () => ({
  triggerHaptic,
}))

import { useAppToastStore } from '@/stores/app-toast-store'

describe('app toast store', () => {
  beforeEach(() => {
    triggerHaptic.mockClear()
    useAppToastStore.setState({
      currentToast: null,
      queue: [],
    })
  })

  it('ignores empty toast messages after trimming', () => {
    useAppToastStore.getState().showError('   ')

    expect(useAppToastStore.getState().currentToast).toBeNull()
    expect(useAppToastStore.getState().queue).toEqual([])
  })

  it('shows the first error immediately and trims whitespace', () => {
    useAppToastStore.getState().showError('  Network error  ')

    expect(useAppToastStore.getState().currentToast).toMatchObject({
      message: 'Network error',
      variant: 'error',
    })
  })

  it('queues later toasts and promotes them when dismissing', () => {
    const store = useAppToastStore.getState()

    store.showError('First')
    store.showError('Second')
    store.showError('Third')

    expect(useAppToastStore.getState().currentToast?.message).toBe('First')
    expect(useAppToastStore.getState().queue.map((toast) => toast.message)).toEqual([
      'Second',
      'Third',
    ])

    useAppToastStore.getState().dismissToast()
    expect(useAppToastStore.getState().currentToast?.message).toBe('Second')

    useAppToastStore.getState().dismissToast()
    expect(useAppToastStore.getState().currentToast?.message).toBe('Third')

    useAppToastStore.getState().dismissToast()
    expect(useAppToastStore.getState().currentToast).toBeNull()
    expect(useAppToastStore.getState().queue).toEqual([])
  })

  it('stores queued toast actions and triggers selection haptics', () => {
    const onAction = vi.fn()

    useAppToastStore.getState().showQueued('Queued change', 'Undo', onAction)

    expect(useAppToastStore.getState().currentToast).toMatchObject({
      message: 'Queued change',
      variant: 'queued',
      actionLabel: 'Undo',
    })
    expect(triggerHaptic).toHaveBeenCalledWith('selection')

    useAppToastStore.getState().triggerAction()

    expect(onAction).toHaveBeenCalledTimes(1)
    expect(useAppToastStore.getState().currentToast).toBeNull()
  })

  it('supports success and info variants without dropping queued items', () => {
    const store = useAppToastStore.getState()

    store.showSuccess('Saved')
    store.showInfo('Syncing')

    expect(useAppToastStore.getState().currentToast).toMatchObject({
      message: 'Saved',
      variant: 'success',
    })
    expect(useAppToastStore.getState().queue).toMatchObject([
      { message: 'Syncing', variant: 'info' },
    ])
    expect(triggerHaptic).toHaveBeenCalledWith('success')
  })
})

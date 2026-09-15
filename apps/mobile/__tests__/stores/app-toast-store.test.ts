import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useAppToastStore } from '@/stores/app-toast-store'

const triggerHaptic = vi.hoisted(() => vi.fn(async () => {}))

vi.mock('@/lib/haptics', () => ({
  triggerHaptic,
}))

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

  it('ignores a whitespace-only showToast message', () => {
    useAppToastStore.getState().showToast({ message: '   ', variant: 'info' })

    expect(useAppToastStore.getState().currentToast).toBeNull()
    expect(useAppToastStore.getState().queue).toEqual([])
  })

  it('shows the first showToast immediately and queues the next one', () => {
    const store = useAppToastStore.getState()

    store.showToast({ message: '  First  ', variant: 'info' })
    store.showToast({ message: 'Second', variant: 'error' })

    expect(useAppToastStore.getState().currentToast).toMatchObject({
      message: 'First',
      variant: 'info',
    })
    expect(useAppToastStore.getState().queue).toMatchObject([
      { message: 'Second', variant: 'error' },
    ])
  })

  it('does not stack duplicate non-action toasts', () => {
    const store = useAppToastStore.getState()

    store.showInfo('Syncing')
    store.showInfo('Syncing')
    store.showError('Blocked')
    store.showError('Blocked')

    expect(useAppToastStore.getState().currentToast?.message).toBe('Syncing')
    expect(useAppToastStore.getState().queue.map((toast) => toast.message)).toEqual(['Blocked'])
  })

  it('deduplicates every public non-action toast path', () => {
    const store = useAppToastStore.getState()

    store.showToast({ message: 'Direct', variant: 'info' })
    store.showToast({ message: 'Direct', variant: 'info' })
    store.showSuccess('Saved')
    store.showSuccess('Saved')
    store.showQueued('Queued')
    store.showQueued('Queued')

    expect(useAppToastStore.getState().queue.map((toast) => toast.message)).toEqual([
      'Saved',
      'Queued',
    ])
  })

  it('queues success and queued toasts behind an active toast', () => {
    const store = useAppToastStore.getState()

    store.showInfo('Active')
    store.showSuccess('Saved later')
    store.showQueued('Queued later', 'Undo', vi.fn())

    expect(useAppToastStore.getState().currentToast?.message).toBe('Active')
    expect(useAppToastStore.getState().queue.map((toast) => toast.message)).toEqual([
      'Saved later',
      'Queued later',
    ])
  })
})

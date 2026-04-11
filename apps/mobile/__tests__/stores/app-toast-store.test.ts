import { beforeEach, describe, expect, it } from 'vitest'
import { useAppToastStore } from '@/stores/app-toast-store'

describe('app toast store', () => {
  beforeEach(() => {
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
})

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))

let releasePresentation: () => void
const loading = vi.hoisted(() => ({ started: vi.fn() }))

beforeEach(() => {
  vi.resetModules()
  loading.started.mockClear()
  const ready = new Promise<void>(resolve => { releasePresentation = resolve })
  vi.doMock('@/components/ui/modal-error-notice', async importOriginal => {
    loading.started()
    await ready
    return importOriginal()
  })
})

afterEach(async () => {
  cleanup()
  releasePresentation()
  await vi.dynamicImportSettled()
  const { useUIStore } = await import('@/stores/ui-store')
  const { useAppToastStore } = await import('@/stores/app-toast-store')
  useUIStore.setState({ openOverlayIds: [] })
  useAppToastStore.getState().dismissAllToasts()
})

it('loads only for an active modal error and retains its retry and dismiss actions', async () => {
  const { AppToastHost } = await import('@/components/ui/app-toast-host')
  const { useUIStore } = await import('@/stores/ui-store')
  const { useAppToastStore } = await import('@/stores/app-toast-store')
  useUIStore.setState({ openOverlayIds: ['modal:lower', 'modal:upper'] })
  const retry = vi.fn()
  render(<><AppToastHost /><section aria-label="Lower"><AppToastHost placement="modal" modalId="modal:lower" /></section><section aria-label="Upper"><AppToastHost placement="modal" modalId="modal:upper" /></section></>)
  expect(loading.started).not.toHaveBeenCalled()
  act(() => {
    useAppToastStore.getState().showQueued('Removed', 'Undo', vi.fn())
    useAppToastStore.getState().showError('Connection failed', 'Retry', retry)
  })
  expect(screen.queryByRole('alert')).toBeNull()
  await act(async () => {
    releasePresentation()
    await vi.dynamicImportSettled()
  })
  expect(screen.getByRole('alert').closest('section')).toHaveAccessibleName('Upper')
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
  expect(retry).toHaveBeenCalledOnce()
  expect(screen.queryByRole('alert')).toBeNull()
  expect(useAppToastStore.getState().currentToast?.toast.message).toBe('Removed')
  act(() => { useAppToastStore.getState().showError('Another failure') })
  await screen.findByText('Another failure')
  fireEvent.click(screen.getByRole('button', { name: 'common.close' }))
  expect(screen.queryByRole('alert')).toBeNull()
})

it('does not restore an error dismissed while its presentation is loading', async () => {
  const { AppToastHost } = await import('@/components/ui/app-toast-host')
  const { useUIStore } = await import('@/stores/ui-store')
  const { useAppToastStore } = await import('@/stores/app-toast-store')
  useUIStore.setState({ openOverlayIds: ['modal:active'] })
  render(<AppToastHost placement="modal" modalId="modal:active" />)
  act(() => { useAppToastStore.getState().showError('Dismissed failure') })
  act(() => { useAppToastStore.getState().dismissAllToasts() })
  await act(async () => {
    releasePresentation()
    await vi.dynamicImportSettled()
  })
  expect(screen.queryByRole('alert')).toBeNull()
})

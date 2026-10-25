import React from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { AppToastHost } from '@/components/ui/app-toast-host'
import { NotificationDeleteNotice } from '@/components/navigation/notification-delete-notice'
import { useAppToastStore } from '@/stores/app-toast-store'

const loaded = vi.hoisted(() => vi.fn())
vi.mock('@radix-ui/react-toast', async (importOriginal) => { loaded(); return importOriginal() })
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))

afterEach(() => {
  cleanup()
  useAppToastStore.setState({ currentToast: null, queue: [] })
})

it('loads feedback only when shown and preserves background focus through its actions', async () => {
  const onUndo = vi.fn()
  render(<><button type="button">Keep focus</button><AppToastHost /><NotificationDeleteNotice /></>)
  await act(async () => { await vi.dynamicImportSettled() })
  expect(loaded).not.toHaveBeenCalled()

  const focused = screen.getByRole('button', { name: 'Keep focus' })
  focused.focus()
  await act(async () => {
    useAppToastStore.getState().showQueued('Saved', 'Undo', onUndo)
    await vi.dynamicImportSettled()
  })
  expect(loaded).toHaveBeenCalledOnce()
  expect(focused).toHaveFocus()
  fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
  expect(onUndo).toHaveBeenCalledOnce()
  expect(focused).toHaveFocus()
})

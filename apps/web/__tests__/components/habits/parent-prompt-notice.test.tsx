import { Suspense, useState } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createMockHabit } from '@orbit/shared/__tests__/factories'
import { computeParentPromptChain } from '@orbit/shared/utils'
import { HabitListConfirmDialogs } from '@/components/habits/habit-list/confirm-dialogs'
import { DeferredConfirmDialogs } from '@/components/habits/habit-list/deferred-confirm-dialogs'
import { AppToastHost } from '@/components/ui/app-toast-host'
import { useAppToastStore } from '@/stores/app-toast-store'
import { useUIStore } from '@/stores/ui-store'

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
const deferredDialogs = vi.hoisted(() => ({ hold: null as Promise<void> | null }))
vi.mock('next/dynamic', async importOriginal => {
  const { default: dynamic } = await importOriginal<typeof import('next/dynamic')>()
  return { default: <Props extends object,>(loader: () => Promise<React.ComponentType<Props>>) => dynamic(async () => {
    if (deferredDialogs.hold) await deferredDialogs.hold
    return loader()
  }) }
})
const date = '2026-09-12'
const parent = createMockHabit({ id: 'parent', scheduledDates: [date] })
const child = createMockHabit({ id: 'child', parentId: parent.id, scheduledDates: [date] })
const ancestors = computeParentPromptChain(child.id, new Map([[parent.id, parent], [child.id, child]]), date, {
  getChildren: id => id === parent.id ? [child] : [], isRelevantToday: () => true, isDueOnSelectedDate: () => true,
  skippedIds: new Set([child.id]),
})
const prompt = { ...ancestors[0]!, childId: child.id, ancestors, selectedCount: 1, date }

function ParentNoticeSurface({ confirm, initiallyOpen = true, deferred = false }: { confirm: () => void; initiallyOpen?: boolean; deferred?: boolean }) {
  const [open, setOpen] = useState(initiallyOpen)
  const Dialogs = deferred ? DeferredConfirmDialogs : HabitListConfirmDialogs
  return <><button onClick={() => setOpen(true)}>Resolve child</button><div data-shell-notice-content=""><AppToastHost /></div><Suspense fallback={null}><Dialogs
    t={key => key} parentPrompt={open ? prompt : null} showDeleteConfirm={false} deletePending={false}
    deleteHabitName="" deleteDescendantCount={0} duplicateHabitName={null}
    onSelectParentAncestor={vi.fn()} onConfirmDelete={vi.fn()} onCancelDelete={vi.fn()} onDeleteClosed={vi.fn()}
    onConfirmDuplicate={vi.fn()} onCancelDuplicate={vi.fn()}
    onCancelParent={() => setOpen(false)} onConfirmParent={() => { confirm(); setOpen(false) }}
  /></Suspense></>
}

beforeEach(() => { deferredDialogs.hold = null; vi.useFakeTimers(); useUIStore.setState({ openOverlayIds: [] }); useAppToastStore.setState({ currentToast: null, queue: [] }) })
afterEach(() => { cleanup(); vi.useRealTimers() })

it.each(['cancel', 'confirm', 'close', 'escape'] as const)('holds child undo until parent %s and gives it a full timer', async dismissal => {
  const childUndo = vi.fn()
  const parentUndo = vi.fn()
  render(<ParentNoticeSurface confirm={() => useAppToastStore.getState().showQueued('Parent skipped', 'Undo parent', parentUndo)} />)
  act(() => { useAppToastStore.getState().showQueued('Child skipped', 'Undo child', childUndo) })
  await act(async () => { await vi.dynamicImportSettled() })
  expect(screen.getByRole('dialog', { name: 'habits.autoSkipParentTitle' })).toBeInTheDocument()
  expect(document.querySelector('[data-kind]')).toBeNull()
  await act(() => vi.advanceTimersByTimeAsync(20000))
  if (dismissal === 'escape') fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
  else fireEvent.click(screen.getByRole('button', { name: { cancel: 'common.notNow', confirm: 'habits.autoSkipParentConfirm', close: 'common.close' }[dismissal] }))
  await act(() => vi.advanceTimersByTimeAsync(0))
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(document.querySelector('[data-shell-notice-content] [data-kind]')).toHaveTextContent('Child skipped')
  await act(() => vi.advanceTimersByTimeAsync(4999))
  fireEvent.click(screen.getByRole('button', { name: 'Undo child' }))
  expect(childUndo).toHaveBeenCalledOnce()
  expect(parentUndo).not.toHaveBeenCalled()
})

it.each(['cancel', 'confirm', 'close', 'escape'] as const)('holds an already visible undo through parent %s', async dismissal => {
  const childUndo = vi.fn()
  render(<ParentNoticeSurface initiallyOpen={false} confirm={vi.fn()} />)
  act(() => { useAppToastStore.getState().showQueued('Child skipped', 'Undo child', childUndo) })
  await act(async () => { await vi.dynamicImportSettled() })
  expect(document.querySelector('[data-shell-notice-content] [data-kind]')).toHaveTextContent('Child skipped')
  await act(() => vi.advanceTimersByTimeAsync(4900))
  fireEvent.click(screen.getByRole('button', { name: 'Resolve child' }))
  expect(document.querySelector('[data-kind]')).toBeNull()
  await act(() => vi.advanceTimersByTimeAsync(20000))
  expect(useAppToastStore.getState().currentToast?.toast.message).toBe('Child skipped')
  if (dismissal === 'escape') fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
  else fireEvent.click(screen.getByRole('button', { name: { cancel: 'common.notNow', confirm: 'habits.autoSkipParentConfirm', close: 'common.close' }[dismissal] }))
  await act(() => vi.advanceTimersByTimeAsync(0))
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(document.querySelector('[data-shell-notice-content] [data-kind]')).toHaveTextContent('Child skipped')
  await act(() => vi.advanceTimersByTimeAsync(4999))
  fireEvent.click(screen.getByRole('button', { name: 'Undo child' }))
  expect(childUndo).toHaveBeenCalledOnce()
})

it('holds undo while the owning confirmation chunk is pending, then releases a full timer', async () => {
  const warmup = render(<AppToastHost />)
  act(() => { useAppToastStore.getState().showInfo('Warmup') })
  await act(async () => { await vi.dynamicImportSettled() })
  expect(screen.getByRole('group', { name: 'Warmup' })).toBeInTheDocument()
  act(() => useAppToastStore.getState().dismissAllToasts())
  warmup.unmount()
  let release!: () => void
  deferredDialogs.hold = new Promise<void>(resolve => { release = resolve })
  const childUndo = vi.fn()
  render(<ParentNoticeSurface deferred confirm={vi.fn()} />)
  act(() => { useAppToastStore.getState().showQueued('Child skipped', 'Undo child', childUndo) })
  try {
    expect(screen.queryByRole('dialog')).toBeNull()
    await act(() => vi.advanceTimersByTimeAsync(20000))
    expect(useAppToastStore.getState().currentToast?.toast.message).toBe('Child skipped')
    expect(document.querySelector('[data-kind]')).toBeNull()
  } finally {
    release()
    await act(async () => { await vi.dynamicImportSettled() })
  }
  expect(screen.getByRole('dialog', { name: 'habits.autoSkipParentTitle' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'common.notNow' }))
  await act(() => vi.advanceTimersByTimeAsync(0))
  expect(document.querySelector('[data-shell-notice-content] [data-kind]')).toHaveTextContent('Child skipped')
  await act(() => vi.advanceTimersByTimeAsync(4999))
  fireEvent.click(screen.getByRole('button', { name: 'Undo child' }))
  expect(childUndo).toHaveBeenCalledOnce()
})

import { useState } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createMockHabit } from '@orbit/shared/__tests__/factories'
import { computeParentPromptChain } from '@orbit/shared/utils'
import { HabitListConfirmDialogs } from '@/components/habit-list/confirm-dialogs'
import { AppToast, Toast } from '@/components/ui/app-toast'
import { useAppToastStore } from '@/stores/app-toast-store'
import { useUIStore } from '@/stores/ui-store'
import { PillButton } from '@/components/ui/pill-button'
import { TrueSheet } from '@lodev09/react-native-true-sheet'

vi.unmock('@/components/ui/sheet')
vi.mock('@lodev09/react-native-true-sheet', async () => await import('@/__tests__/support/native-sheet-double'))
const date = '2026-09-12'
const parent = createMockHabit({ id: 'parent', scheduledDates: [date] })
const child = createMockHabit({ id: 'child', parentId: parent.id, scheduledDates: [date] })
const ancestors = computeParentPromptChain(child.id, new Map([[parent.id, parent], [child.id, child]]), date, {
  getChildren: id => id === parent.id ? [child] : [], isRelevantToday: () => true, isDueOnSelectedDate: () => true,
  skippedIds: new Set([child.id]),
})
const prompt = { ...ancestors[0]!, childId: child.id, ancestors, selectedCount: 1, date }
let tree: ReactTestRenderer | undefined

function ParentNoticeSurface({ confirm }: { confirm: () => void }) {
  const [open, setOpen] = useState(true)
  return <><AppToast placement="slot" /><HabitListConfirmDialogs
    t={key => key} parentPrompt={open ? prompt : null} showDeleteConfirm={false} deletePending={false}
    deleteHabitName="" deleteDescendantCount={0} duplicateHabitName={null}
    onSelectParentAncestor={vi.fn()} onConfirmDelete={vi.fn()} onCancelDelete={vi.fn()} onDeleteClosed={vi.fn()}
    onConfirmDuplicate={vi.fn()} onCancelDuplicate={vi.fn()}
    onCancelParent={() => setOpen(false)} onConfirmParent={() => { confirm(); setOpen(false) }}
  /></>
}

beforeEach(() => { vi.useFakeTimers(); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); useUIStore.setState({ openOverlayIds: [] }); useAppToastStore.setState({ currentToast: null, queue: [] }) })
afterEach(async () => { await act(() => tree?.unmount()); tree = undefined; vi.useRealTimers(); vi.unstubAllGlobals() })

it.each(['cancel', 'confirm', 'close', 'back'] as const)('holds child undo until parent %s and gives it a full timer', async dismissal => {
  const childUndo = vi.fn()
  const parentUndo = vi.fn()
  await act(() => { tree = create(<ParentNoticeSurface confirm={() => useAppToastStore.getState().showQueued('Parent skipped', 'Undo parent', parentUndo)} />) })
  await act(() => { useAppToastStore.getState().showQueued('Child skipped', 'Undo child', childUndo) })
  expect(tree!.root.findAllByType(Toast)).toHaveLength(0)
  await act(async () => { await vi.advanceTimersByTimeAsync(20000) })
  if (dismissal === 'back') await act(() => { (tree!.root.findAllByType(TrueSheet)[0]!.props.onDidDismiss as () => void)() })
  else {
    const label = { cancel: 'common.notNow', confirm: 'habits.autoSkipParentConfirm', close: 'common.close' }[dismissal]
    if (dismissal === 'close') {
      const button = tree!.root.findAll(node => (node.type as unknown) === 'Pressable' && node.props.accessibilityLabel === label)[0]!
      await act(() => (button.props.onPress as () => void)())
    } else {
      const button = tree!.root.findAllByType(PillButton).find(node => node.props.children === label)!
      await act(() => (button.props.onClick as () => void)())
    }
  }
  expect(tree!.root.findAllByType(TrueSheet)).toHaveLength(0)
  expect(tree!.root.findAllByType(Toast).map(node => node.props.message)).toEqual(['Child skipped'])
  await act(async () => { await vi.advanceTimersByTimeAsync(4999) })
  const undo = tree!.root.findAll(node => (node.type as unknown) === 'Pressable' && node.props.testID === 'toast-action')[0]!
  await act(() => (undo.props.onPress as () => void)())
  expect(childUndo).toHaveBeenCalledOnce()
  expect(parentUndo).not.toHaveBeenCalled()
})


it('holds a live notice through a native dialog and a menu above it', async () => {
  await act(() => { tree = create(<AppToast placement="slot" />) })
  await act(() => { useAppToastStore.getState().showQueued('Child skipped', 'Undo child', vi.fn()) })
  await act(async () => { await vi.advanceTimersByTimeAsync(2000) })
  await act(() => { useUIStore.getState().registerOpenOverlay('dialog:other'); useUIStore.getState().registerOpenOverlay('menu:other') })
  expect(tree!.root.findAllByType(Toast)).toHaveLength(0)
  await act(async () => { await vi.advanceTimersByTimeAsync(20000) })
  await act(() => { useUIStore.getState().unregisterOpenOverlay('menu:other'); useUIStore.getState().unregisterOpenOverlay('dialog:other') })
  await act(async () => { await vi.advanceTimersByTimeAsync(4999) })
  expect(tree!.root.findAllByType(Toast)).toHaveLength(1)
  await act(async () => { await vi.advanceTimersByTimeAsync(1) })
  expect(useAppToastStore.getState().currentToast).toBeNull()
})

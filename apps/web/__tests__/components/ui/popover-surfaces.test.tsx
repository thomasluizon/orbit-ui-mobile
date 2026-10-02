import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { createMockHabit } from '@orbit/shared/__tests__/factories'
import { HabitRow } from '@/components/habits/habit-row'
import { GoalsView } from '@/components/goals/goals-view'
import { NotificationBell } from '@/components/navigation/notification-bell'
import { TodayUtilityRow } from '@/app/(app)/today-shell'
import { Popover } from '@/components/ui/popover'

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
vi.mock('@/hooks/use-is-client', () => ({ useIsClient: () => true }))
vi.mock('@/hooks/use-goals', () => ({ useGoals: () => ({ data: { allGoals: [] }, isFetched: true }) }))
vi.mock('@/hooks/use-notifications', () => ({
  useNotifications: () => ({ notifications: [], unreadCount: 0, isLoading: false, isError: false, refetch: vi.fn() }),
  useMarkNotificationRead: () => ({ mutate: vi.fn() }),
  useMarkAllNotificationsRead: () => ({ mutate: vi.fn() }),
  useDeleteNotification: () => ({ mutate: vi.fn() }),
  useDeleteAllNotifications: () => ({ mutate: vi.fn() }),
}))
vi.mock('@/hooks/use-app-toast', () => ({ useAppToast: () => ({ showQueued: vi.fn() }) }))
vi.mock('@/components/navigation/notification-detail-modal', () => ({ NotificationDetailModal: () => null }))

afterEach(cleanup)

const surfaces = [
  { name: 'Today controls', trigger: 'habits.actions.more', content: 'common.select' },
  { name: 'Today frequency', trigger: 'habits.frequencyFilter', content: 'common.all' },
  { name: 'goal filters', trigger: 'goals.filters.statusFilter', content: 'goals.filters.all' },
  { name: 'notifications', trigger: 'notifications.bell', content: 'notifications.title' },
]

function MenuSurfaces() {
  return <>
    <TodayUtilityRow
      activeView="today" searchOpen={false} searchValue="" selectedFrequency={null}
      selectedTagIds={[]} tags={[]} frequencyOptions={[{ key: 'Day', label: 'Daily' }]}
      isSelectMode={false} showCompleted={false} isFetching={false} allCollapsed={false}
      onSearchToggle={vi.fn()} onSearchChange={vi.fn()} onFrequencyChange={vi.fn()}
      onTagToggle={vi.fn()} onToggleSelect={vi.fn()} onToggleCollapse={vi.fn()}
      onRefresh={vi.fn()} onToggleCompleted={vi.fn()}
    />
    <GoalsView />
    <NotificationBell />
  </>
}

function press(trigger: HTMLElement, activation: string) {
  if (activation === 'pointer') fireEvent.pointerDown(trigger)
  fireEvent.click(trigger)
}

describe.each(surfaces)('$name menu ownership', ({ trigger, content }) => {
  it.each([
    ['open', 'pointer'], ['exiting', 'pointer'],
    ['open', 'click-only'], ['exiting', 'click-only'],
  ])('replaces the %s surface menu with a habit menu and back via %s activation', (phase, activation) => {
    render(<>
      <div data-testid="surfaces"><MenuSurfaces /></div>
      <div data-testid="row">
        <HabitRow habit={createMockHabit({ title: 'Read' })} actions={{ onEdit: vi.fn() }} />
      </div>
    </>)
    const surfaceTrigger = within(screen.getByTestId('surfaces')).getByRole('button', { name: trigger })
    const rowTrigger = within(screen.getByTestId('row')).getByRole('button', { name: 'habits.actions.more' })
    press(surfaceTrigger, activation)
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    expect(screen.getByText(content)).toBeInTheDocument()
    if (phase === 'exiting') {
      fireEvent.keyDown(document, { key: 'Escape' })
      expect(screen.getAllByRole('dialog')).toHaveLength(1)
    }
    press(rowTrigger, activation)
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    expect(screen.getByRole('menuitem', { name: 'common.edit' })).toBeInTheDocument()
    expect(screen.queryByText(content)).toBeNull()
    if (phase === 'exiting') {
      fireEvent.keyDown(document, { key: 'Escape' })
      expect(screen.getAllByRole('dialog')).toHaveLength(1)
    }
    press(surfaceTrigger, activation)
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    expect(screen.getByText(content)).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'common.edit' })).toBeNull()
  })
})

describe('controlled popover ownership', () => {
  it('suppresses replacement while the parent is still open and permits a later reopen', () => {
    const onOpenChange = vi.fn()
    function ControlledSurfaces({ open }: { open: boolean }) {
      return <>
        <Popover trigger={<button type="button">Controlled menu</button>} open={open} onOpenChange={onOpenChange}>
          <button type="button">Controlled action</button>
        </Popover>
        <HabitRow habit={createMockHabit({ title: 'Read' })} actions={{ onEdit: vi.fn() }} />
      </>
    }
    const { rerender } = render(<ControlledSurfaces open />)
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'habits.actions.more' }))
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    expect(screen.queryByRole('button', { name: 'Controlled action' })).toBeNull()
    expect(screen.getByRole('menuitem', { name: 'common.edit' })).toBeInTheDocument()
    expect(onOpenChange).toHaveBeenCalledWith(false)
    rerender(<ControlledSurfaces open />)
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    expect(screen.queryByRole('button', { name: 'Controlled action' })).toBeNull()
    rerender(<ControlledSurfaces open={false} />)
    rerender(<ControlledSurfaces open />)
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Controlled action' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'common.edit' })).toBeNull()
  })
})

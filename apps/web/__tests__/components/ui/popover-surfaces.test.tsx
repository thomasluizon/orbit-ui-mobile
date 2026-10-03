import { useRef, useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createMockHabit } from '@orbit/shared/__tests__/factories'
import { HabitRow } from '@/components/habits/habit-row'
import { TodayDateControl } from '@/app/(app)/today-shell'
import { Menu } from '@/components/ui/menu'

vi.mock('next/navigation', () => ({ usePathname: () => '/', useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/hooks/use-notification-inbox', () => ({ useNotificationInbox: () => ({ visibleUnreadCount: 0 }) }))
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

function TodayControls() {
  return <TodayDateControl dayName="Monday" numericDate="01/01" isTodaySelected nextDisabled={false}
    previousLabel="Previous" todayLabel="Today" goToTodayLabel="Go to today" nextLabel="Next"
    moreLabel="List options" selectLabel="Select" collapseLabel="Collapse" allCollapsed={false}
    refreshLabel="Refresh" completedLabel="Completed" showCompleted={false} isFetching={false}
    searchLabel="Search" onSearch={vi.fn()} onToggleSelect={vi.fn()} onToggleCollapse={vi.fn()}
    onRefresh={vi.fn()} onToggleCompleted={vi.fn()} onGoToPreviousDay={vi.fn()}
    onGoToToday={vi.fn()} onGoToNextDay={vi.fn()} />
}

const cases = (['sheet', 'anchored'] as const).flatMap((presentation) =>
  (['open', 'dismissed', 'reopened'] as const).flatMap((phase) =>
    (['pointer', 'click-only'] as const).map((activation) => ({ presentation, phase, activation }))))

describe('Today controls and habit menu ownership', () => {
  it.each(cases)('replaces the $phase $presentation menu and back via $activation', async ({ presentation, phase, activation }) => {
    vi.stubGlobal('matchMedia', () => ({ matches: presentation === 'anchored', addEventListener: vi.fn(), removeEventListener: vi.fn() }))
    render(<><TodayControls /><HabitRow habit={createMockHabit({ title: 'Read' })} actions={{ onEdit: vi.fn() }} /></>)
    const controlsTrigger = screen.getByRole('button', { name: 'List options' })
    const rowTrigger = screen.getByRole('button', { name: 'habits.actions.more' })
    const press = (trigger: HTMLElement) => {
      if (activation === 'pointer') fireEvent.pointerDown(trigger)
      fireEvent.click(trigger)
    }
    const prepare = async (trigger: HTMLElement, label: string) => {
      press(trigger)
      await screen.findByRole('menuitem', { name: label })
      if (phase === 'open') return
      fireEvent.keyDown(document, { key: 'Escape' })
      if (phase !== 'reopened') return
      press(trigger)
      await screen.findByRole('menuitem', { name: label })
    }
    await prepare(controlsTrigger, 'Select')
    await prepare(rowTrigger, 'common.edit')
    if (phase !== 'dismissed') {
      expect(screen.getAllByRole('menu')).toHaveLength(1)
      expect(screen.queryByRole('menuitem', { name: 'Select' })).toBeNull()
      expect(controlsTrigger).toHaveAttribute('aria-expanded', 'false')
    }
    press(controlsTrigger)
    await screen.findByRole('menuitem', { name: 'Select' })
    expect(screen.getAllByRole('menu')).toHaveLength(1)
    expect(screen.queryByRole('menuitem', { name: 'common.edit' })).toBeNull()
    expect(rowTrigger).toHaveAttribute('aria-expanded', 'false')
    if (presentation === 'anchored') {
      await waitFor(() => expect(screen.getByRole('menuitem', { name: 'Select' })).toHaveFocus())
    }
  })

  it.each(['pointer', 'click-only'] as const)('replaces a sheet while its exit is pending via %s', async (activation) => {
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
    render(<><TodayControls /><HabitRow habit={createMockHabit({ title: 'Read' })} actions={{ onEdit: vi.fn() }} /></>)
    const controlsTrigger = screen.getByRole('button', { name: 'List options' })
    const rowTrigger = screen.getByRole('button', { name: 'habits.actions.more' })
    const press = (trigger: HTMLElement) => {
      if (activation === 'pointer') fireEvent.pointerDown(trigger)
      fireEvent.click(trigger)
    }
    controlsTrigger.focus()
    press(controlsTrigger)
    await screen.findByRole('menuitem', { name: 'Select' })
    const exitingPanel = screen.getByRole('dialog')
    await waitFor(() => expect(exitingPanel).toContainElement(document.activeElement as HTMLElement))
    let finishExit!: () => void
    const finished = new Promise<void>((resolve) => { finishExit = resolve })
    const getAnimations = vi.fn(() => [{ finished }])
    Object.defineProperty(exitingPanel, 'getAnimations', { value: getAnimations })
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(getAnimations).toHaveBeenCalled())
    expect(exitingPanel).toHaveAttribute('data-ending-style')
    expect(exitingPanel).toBeInTheDocument()
    expect(controlsTrigger).toHaveAttribute('aria-expanded', 'true')

    const previousTriggerFocus = vi.fn()
    controlsTrigger.addEventListener('focus', previousTriggerFocus)
    press(rowTrigger)
    await screen.findByRole('menuitem', { name: 'common.edit' })
    await waitFor(() => expect(screen.getByRole('dialog')).toContainElement(document.activeElement as HTMLElement))
    expect(previousTriggerFocus).not.toHaveBeenCalled()
    expect(exitingPanel).not.toBeInTheDocument()
    expect(document.querySelectorAll('[role="menu"]')).toHaveLength(1)
    expect(screen.queryByRole('menuitem', { name: 'Select', hidden: true })).toBeNull()
    press(controlsTrigger)
    await screen.findByRole('menuitem', { name: 'Select' })
    await act(async () => { finishExit(); await finished })
    expect(document.querySelectorAll('[role="menu"]')).toHaveLength(1)
    expect(screen.getByRole('menuitem', { name: 'Select' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'common.edit', hidden: true })).toBeNull()
    expect(controlsTrigger).toHaveAttribute('aria-expanded', 'true')
    expect(rowTrigger).toHaveAttribute('aria-expanded', 'false')
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await waitFor(() => expect(controlsTrigger).toHaveFocus())
  })

})

function ControlledMenus({ open, onClose }: { open: boolean; onClose: () => void }) {
  const firstAnchor = useRef<HTMLButtonElement>(null)
  const secondAnchor = useRef<HTMLButtonElement>(null)
  const [secondOpen, setSecondOpen] = useState(false)
  return <>
    <button ref={firstAnchor} type="button">Controlled menu</button>
    <Menu open={open} presentation="anchored" anchorRef={firstAnchor} title="Controlled" onClose={onClose}
      items={[{ id: 'first', label: 'First action' }]} />
    <button ref={secondAnchor} type="button" onClick={() => setSecondOpen(true)}>Second menu</button>
    <Menu open={secondOpen} presentation="anchored" anchorRef={secondAnchor} title="Second" onClose={() => setSecondOpen(false)}
      items={[{ id: 'second', label: 'Second action' }]} />
  </>
}

describe('controlled menu ownership', () => {
  it('suppresses a replaced menu until a fresh open transition', async () => {
    const onClose = vi.fn()
    const { rerender } = render(<ControlledMenus open onClose={onClose} />)
    await screen.findByRole('menuitem', { name: 'First action' })
    fireEvent.click(screen.getByRole('button', { name: 'Second menu' }))
    await screen.findByRole('menuitem', { name: 'Second action' })
    expect(screen.getAllByRole('menu')).toHaveLength(1)
    expect(screen.queryByRole('menuitem', { name: 'First action' })).toBeNull()
    expect(onClose).toHaveBeenCalledWith()
    rerender(<ControlledMenus open onClose={onClose} />)
    expect(screen.getAllByRole('menu')).toHaveLength(1)
    rerender(<ControlledMenus open={false} onClose={onClose} />)
    rerender(<ControlledMenus open onClose={onClose} />)
    await screen.findByRole('menuitem', { name: 'First action' })
    expect(screen.getAllByRole('menu')).toHaveLength(1)
    expect(screen.queryByRole('menuitem', { name: 'Second action' })).toBeNull()
  })
})

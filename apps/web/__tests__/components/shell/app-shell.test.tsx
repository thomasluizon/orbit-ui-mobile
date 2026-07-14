import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

const push = vi.fn()
const setActiveView = vi.fn()
const setShowCreateModal = vi.fn()
const setShowCreateGoalModal = vi.fn()
const setRailOpen = vi.fn()
const setAstraOpen = vi.fn()
const setAstraMaximized = vi.fn()
const setRouteTransitionIntent = vi.fn()

interface SidebarChild { id: string; label: string; onSelect: () => void }
interface SidebarSection { id: string; label: string; onSelect: () => void; children?: SidebarChild[] }

const mocks = vi.hoisted(() => ({
  profile: { hasProAccess: true } as Record<string, unknown> | undefined,
  sections: [] as SidebarSection[],
  createHabit: (() => {}) as () => void,
  createGoal: (() => {}) as () => void,
}))

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }), usePathname: () => '/' }))
vi.mock('@/components/ui/astra-avatar', () => ({ AstraMark: () => <span /> }))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: mocks.profile }) }))
vi.mock('@/hooks/use-keyboard-shortcuts', () => ({ useKeyboardShortcuts: () => {} }))
vi.mock('@/lib/motion/route-intent', () => ({ setRouteTransitionIntent: (intent: string) => setRouteTransitionIntent(intent) }))
vi.mock('@/stores/ui-store', () => ({
  useUIStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({ activeView: 'today', setActiveView, setShowCreateModal, setShowCreateGoalModal }),
}))
vi.mock('@/stores/shell-store', () => ({
  useShellStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({ sidebarCollapsed: false, toggleSidebar: vi.fn(), railOpen: false, setRailOpen, setAstraOpen, setAstraMaximized }),
}))
vi.mock('@/components/navigation/app-sidebar', () => ({
  AppSidebar: ({ sections, onCreate }: { sections: SidebarSection[]; onCreate: () => void }) => {
    mocks.sections = sections
    return (
      <div>
        {sections.map((section) => (
          <div key={section.id}>
            <button type="button" aria-label={section.id} onClick={section.onSelect} />
            {section.children?.map((child) => (
              <button key={child.id} type="button" aria-label={`child-${child.id}`} onClick={child.onSelect} />
            ))}
          </div>
        ))}
        <button type="button" aria-label="sidebar-create" onClick={onCreate} />
      </div>
    )
  },
}))
vi.mock('@/components/command/command-palette', () => ({
  CommandPalette: ({ onCreateHabit, onCreateGoal }: { onCreateHabit: () => void; onCreateGoal: () => void }) => {
    mocks.createHabit = onCreateHabit
    mocks.createGoal = onCreateGoal
    return (
      <div>
        <button type="button" aria-label="cmd-create-habit" onClick={onCreateHabit} />
        <button type="button" aria-label="cmd-create-goal" onClick={onCreateGoal} />
      </div>
    )
  },
}))
vi.mock('@/components/shell/astra-copilot-rail', () => ({ AstraCopilotRail: () => null }))
vi.mock('@/components/shell/desktop-topbar', () => ({ DesktopTopbar: () => <div data-testid="topbar" /> }))
vi.mock('@/components/shell/in-app-shell-context', () => ({ InAppShellProvider: ({ children }: { children: React.ReactNode }) => <>{children}</> }))
vi.mock('@/components/shell/rail-drawer', () => ({ RailDrawer: ({ children }: { children: React.ReactNode }) => <>{children}</> }))
vi.mock('@/components/shell/right-rail', () => ({ RightRail: ({ children }: { children: React.ReactNode }) => <>{children}</> }))
vi.mock('@/components/shell/today-rail', () => ({ TodayRail: () => <div data-testid="today-rail" /> }))
vi.mock('@/components/shell/topbar-slot', () => ({ TopbarSlotProvider: ({ children }: { children: React.ReactNode }) => <>{children}</> }))
vi.mock('@/components/shell/topbar-title', () => ({ resolveTopbarTitleKey: () => '' }))

import { AppShell } from '@/components/shell/app-shell'

function renderShell() {
  const onCreate = vi.fn()
  render(
    <AppShell onCreate={onCreate}>
      <div data-testid="content" />
    </AppShell>,
  )
  return onCreate
}

describe('AppShell', () => {
  beforeEach(() => {
    push.mockClear()
    setActiveView.mockClear()
    setShowCreateModal.mockClear()
    setShowCreateGoalModal.mockClear()
    setAstraMaximized.mockClear()
    setRouteTransitionIntent.mockClear()
    mocks.profile = { hasProAccess: true }
  })

  it('renders the shell content and today rail on the home route', () => {
    renderShell()
    expect(screen.getByTestId('content')).toBeInTheDocument()
    expect(screen.getAllByTestId('today-rail').length).toBeGreaterThan(0)
  })

  it('opens Goals for a Pro user by switching view and navigating home', () => {
    renderShell()
    fireEvent.click(screen.getByRole('button', { name: 'goals' }))
    expect(setActiveView).toHaveBeenCalledWith('goals')
    expect(setRouteTransitionIntent).toHaveBeenCalledWith('tab')
    expect(setAstraMaximized).toHaveBeenCalledWith(false)
    expect(push).toHaveBeenCalledWith('/')
  })

  it('gates Goals behind upgrade for a free user', () => {
    mocks.profile = { hasProAccess: false }
    renderShell()
    fireEvent.click(screen.getByRole('button', { name: 'goals' }))
    expect(push).toHaveBeenCalledWith('/upgrade')
    expect(setActiveView).not.toHaveBeenCalledWith('goals')
  })

  it('selects a habit sub-view and returns to home', () => {
    renderShell()
    fireEvent.click(screen.getByRole('button', { name: 'child-all' }))
    expect(setActiveView).toHaveBeenCalledWith('all')
    expect(push).toHaveBeenCalledWith('/')
  })

  it('opens the create-habit modal from the command palette', () => {
    renderShell()
    fireEvent.click(screen.getByRole('button', { name: 'cmd-create-habit' }))
    expect(setShowCreateModal).toHaveBeenCalledWith(true)
  })

  it('routes command-palette goal creation to upgrade for free users', () => {
    mocks.profile = { hasProAccess: false }
    renderShell()
    fireEvent.click(screen.getByRole('button', { name: 'cmd-create-goal' }))
    expect(push).toHaveBeenCalledWith('/upgrade')
    expect(setShowCreateGoalModal).not.toHaveBeenCalled()
  })

  it('opens the create-goal modal from the command palette for Pro users', () => {
    renderShell()
    fireEvent.click(screen.getByRole('button', { name: 'cmd-create-goal' }))
    expect(setShowCreateGoalModal).toHaveBeenCalledWith(true)
  })

  it('forwards the sidebar create action to the shell owner', () => {
    const onCreate = renderShell()
    fireEvent.click(screen.getByRole('button', { name: 'sidebar-create' }))
    expect(onCreate).toHaveBeenCalledTimes(1)
  })
})

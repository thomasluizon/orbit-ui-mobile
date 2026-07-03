import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import type { ComponentProps, ComponentType } from 'react'
import type { LucideProps } from 'lucide-react'
import {
  AppSidebar,
  type SidebarSection,
} from '@/components/navigation/app-sidebar'

const StubIcon: ComponentType<LucideProps> = () => <svg data-testid="nav-icon" />

type SidebarProps = ComponentProps<typeof AppSidebar>

const habitsChildren = {
  today: vi.fn(),
  all: vi.fn(),
  general: vi.fn(),
}

function buildSections(): SidebarSection[] {
  return [
    {
      id: 'habits',
      label: 'Habits',
      icon: StubIcon,
      active: true,
      expanded: true,
      onSelect: vi.fn(),
      children: [
        { id: 'today', label: 'Today', active: true, onSelect: habitsChildren.today },
        { id: 'all', label: 'All', active: false, onSelect: habitsChildren.all },
        { id: 'general', label: 'General', active: false, onSelect: habitsChildren.general },
      ],
    },
    { id: 'calendar', label: 'Calendar', icon: StubIcon, active: false, onSelect: vi.fn() },
    { id: 'goals', label: 'Goals', icon: StubIcon, active: false, onSelect: vi.fn() },
    { id: 'social', label: 'Friends', icon: StubIcon, active: false, onSelect: vi.fn() },
    { id: 'explore', label: 'Explore', icon: StubIcon, active: false, onSelect: vi.fn() },
    { id: 'profile', label: 'Profile', icon: StubIcon, active: false, onSelect: vi.fn() },
  ]
}

function renderSidebar(overrides: Partial<SidebarProps> = {}): SidebarProps {
  const props: SidebarProps = {
    sections: buildSections(),
    collapsed: false,
    onToggleCollapsed: vi.fn(),
    collapseLabel: 'Collapse sidebar',
    expandLabel: 'Expand sidebar',
    onCreate: vi.fn(),
    createLabel: 'Create habit',
    brandLabel: 'Orbit',
    navLabel: 'Main navigation',
    ...overrides,
  }
  render(<AppSidebar {...props} />)
  return props
}

describe('AppSidebar', () => {
  it('renders each top-level section with its label', () => {
    renderSidebar()
    const nav = screen.getByRole('navigation')

    for (const label of ['Habits', 'Calendar', 'Goals', 'Friends', 'Explore', 'Profile']) {
      expect(within(nav).getByRole('button', { name: label })).toBeInTheDocument()
    }
  })

  it('expands the Habits group into Today / All / General sub-items', () => {
    renderSidebar()
    const nav = screen.getByRole('navigation')

    expect(within(nav).getByRole('button', { name: 'Today' })).toBeInTheDocument()
    expect(within(nav).getByRole('button', { name: 'All' })).toBeInTheDocument()
    expect(within(nav).getByRole('button', { name: 'General' })).toBeInTheDocument()
  })

  it('marks the Habits parent expanded via aria-expanded', () => {
    renderSidebar()
    const nav = screen.getByRole('navigation')

    expect(within(nav).getByRole('button', { name: 'Habits' })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
  })

  it('collapses the group to the parent when a section is not expanded', () => {
    const sections = buildSections()
    sections[0]!.expanded = false
    renderSidebar({ sections })
    const nav = screen.getByRole('navigation')

    expect(within(nav).queryByRole('button', { name: 'Today' })).not.toBeInTheDocument()
    expect(within(nav).queryByRole('button', { name: 'All' })).not.toBeInTheDocument()
    expect(within(nav).getByRole('button', { name: 'Habits' })).toHaveAttribute(
      'aria-expanded',
      'false',
    )
  })

  it('fires a sub-item onSelect when a child is clicked', () => {
    renderSidebar()
    const nav = screen.getByRole('navigation')

    fireEvent.click(within(nav).getByRole('button', { name: 'All' }))

    expect(habitsChildren.all).toHaveBeenCalledTimes(1)
    expect(habitsChildren.today).not.toHaveBeenCalled()
  })

  it('fires a top-level section onSelect when clicked', () => {
    const sections = buildSections()
    renderSidebar({ sections })
    const nav = screen.getByRole('navigation')

    fireEvent.click(within(nav).getByRole('button', { name: 'Calendar' }))

    expect(sections[1]!.onSelect).toHaveBeenCalledTimes(1)
  })

  it('marks the active leaf section with aria-current page', () => {
    const sections = buildSections()
    sections[1]!.active = true
    renderSidebar({ sections })
    const nav = screen.getByRole('navigation')

    expect(within(nav).getByRole('button', { name: 'Calendar' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(within(nav).getByRole('button', { name: 'Profile' })).not.toHaveAttribute(
      'aria-current',
    )
  })

  it('marks the active sub-item with aria-current page, not the expanded parent', () => {
    renderSidebar()
    const nav = screen.getByRole('navigation')

    expect(within(nav).getByRole('button', { name: 'Today' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(within(nav).getByRole('button', { name: 'Habits' })).not.toHaveAttribute(
      'aria-current',
    )
  })

  it('fires onCreate when the create button is clicked', () => {
    const props = renderSidebar()

    fireEvent.click(screen.getByRole('button', { name: 'Create habit' }))

    expect(props.onCreate).toHaveBeenCalledTimes(1)
  })

  it('toggles collapse and labels the control collapse while expanded', () => {
    const props = renderSidebar({ collapsed: false })

    fireEvent.click(screen.getByRole('button', { name: 'Collapse sidebar' }))

    expect(props.onToggleCollapsed).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('button', { name: 'Expand sidebar' })).not.toBeInTheDocument()
  })

  it('labels the toggle expand while collapsed', () => {
    renderSidebar({ collapsed: true })

    expect(screen.getByRole('button', { name: 'Expand sidebar' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Collapse sidebar' })).not.toBeInTheDocument()
  })

  it('renders section labels while expanded', () => {
    renderSidebar({ collapsed: false })

    expect(screen.getByText('Habits')).toBeInTheDocument()
    expect(screen.getByText('Calendar')).toBeInTheDocument()
    expect(screen.getByText('Friends')).toBeInTheDocument()
    expect(screen.getByText('Explore')).toBeInTheDocument()
    expect(screen.getByText('Profile')).toBeInTheDocument()
  })

  it('hides labels and collapses the group to icons while collapsed', () => {
    renderSidebar({ collapsed: true })

    expect(screen.queryByText('Habits')).not.toBeInTheDocument()
    expect(screen.queryByText('Calendar')).not.toBeInTheDocument()
    expect(screen.queryByText('Today')).not.toBeInTheDocument()
    expect(screen.queryByText('All')).not.toBeInTheDocument()
  })
})

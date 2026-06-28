import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import type { ComponentProps, ComponentType } from 'react'
import type { LucideProps } from 'lucide-react'
import { AppSidebar, type SidebarNavItem } from '@/components/navigation/app-sidebar'

const StubIcon: ComponentType<LucideProps> = () => <svg data-testid="nav-icon" />

type SidebarProps = ComponentProps<typeof AppSidebar>

function buildItems(): SidebarNavItem[] {
  return [
    { id: 'today', label: 'Today', icon: StubIcon, onSelect: vi.fn() },
    { id: 'goals', label: 'Goals', icon: StubIcon, onSelect: vi.fn() },
    { id: 'profile', label: 'Profile', icon: StubIcon, onSelect: vi.fn() },
  ]
}

function renderSidebar(overrides: Partial<SidebarProps> = {}): SidebarProps {
  const props: SidebarProps = {
    items: buildItems(),
    activeId: 'today',
    collapsed: false,
    onToggleCollapsed: vi.fn(),
    collapseLabel: 'Collapse sidebar',
    expandLabel: 'Expand sidebar',
    onCreate: vi.fn(),
    createLabel: 'Create habit',
    brandLabel: 'Orbit',
    ...overrides,
  }
  render(<AppSidebar {...props} />)
  return props
}

describe('AppSidebar', () => {
  it('renders one nav button per item with its label', () => {
    const props = renderSidebar()
    const nav = screen.getByRole('navigation')

    expect(within(nav).getAllByRole('button')).toHaveLength(props.items.length)
    for (const item of props.items) {
      expect(within(nav).getByRole('button', { name: item.label })).toBeInTheDocument()
    }
  })

  it('marks only the active item with aria-current page', () => {
    renderSidebar({ activeId: 'goals' })
    const nav = screen.getByRole('navigation')

    expect(within(nav).getByRole('button', { name: 'Goals' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(within(nav).getByRole('button', { name: 'Today' })).not.toHaveAttribute('aria-current')
    expect(within(nav).getByRole('button', { name: 'Profile' })).not.toHaveAttribute('aria-current')
  })

  it('fires the item onSelect when a nav item is clicked', () => {
    const items = buildItems()
    renderSidebar({ items })
    const nav = screen.getByRole('navigation')

    fireEvent.click(within(nav).getByRole('button', { name: 'Goals' }))

    expect(items[1]!.onSelect).toHaveBeenCalledTimes(1)
    expect(items[0]!.onSelect).not.toHaveBeenCalled()
  })

  it('fires onCreate when the create button is clicked', () => {
    const props = renderSidebar()

    fireEvent.click(screen.getByRole('button', { name: 'Create habit' }))

    expect(props.onCreate).toHaveBeenCalledTimes(1)
  })

  it('toggles collapse and labels the control collapse while expanded', () => {
    const props = renderSidebar({ collapsed: false })

    const toggle = screen.getByRole('button', { name: 'Collapse sidebar' })
    fireEvent.click(toggle)

    expect(props.onToggleCollapsed).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('button', { name: 'Expand sidebar' })).not.toBeInTheDocument()
  })

  it('labels the toggle expand while collapsed', () => {
    renderSidebar({ collapsed: true })

    expect(screen.getByRole('button', { name: 'Expand sidebar' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Collapse sidebar' })).not.toBeInTheDocument()
  })

  it('renders item labels while expanded', () => {
    renderSidebar({ collapsed: false })

    expect(screen.getByText('Today')).toBeInTheDocument()
    expect(screen.getByText('Goals')).toBeInTheDocument()
    expect(screen.getByText('Profile')).toBeInTheDocument()
  })

  it('hides item labels while collapsed (icon-only rail)', () => {
    renderSidebar({ collapsed: true })

    expect(screen.queryByText('Today')).not.toBeInTheDocument()
    expect(screen.queryByText('Goals')).not.toBeInTheDocument()
    expect(screen.queryByText('Profile')).not.toBeInTheDocument()
  })
})

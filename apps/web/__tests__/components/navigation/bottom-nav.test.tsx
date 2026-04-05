import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

let mockPathname = '/'

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
}))

vi.mock('next/link', () => ({
  default: ({ children, href, onClick, ...props }: { children: React.ReactNode; href: string; onClick?: (e: React.MouseEvent) => void }) => (
    <a href={href} onClick={onClick} {...props}>{children}</a>
  ),
}))

const mockSetSelectedDate = vi.fn()
const mockSetActiveView = vi.fn()

vi.mock('@/stores/ui-store', () => ({
  useUIStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      setSelectedDate: mockSetSelectedDate,
      setActiveView: mockSetActiveView,
    }),
}))

vi.mock('@orbit/shared/utils', () => ({
  formatAPIDate: () => '2025-06-15',
}))

import { BottomNav } from '@/components/navigation/bottom-nav'

describe('BottomNav', () => {
  it('renders navigation element', () => {
    render(<BottomNav />)
    expect(screen.getByRole('navigation')).toBeInTheDocument()
  })

  it('renders all four nav links', () => {
    render(<BottomNav />)
    expect(screen.getByText('nav.habits')).toBeInTheDocument()
    expect(screen.getByText('nav.chat')).toBeInTheDocument()
    expect(screen.getByText('nav.calendar')).toBeInTheDocument()
    expect(screen.getByText('nav.profile')).toBeInTheDocument()
  })

  it('renders the FAB button', () => {
    render(<BottomNav />)
    expect(screen.getByLabelText('nav.createHabit')).toBeInTheDocument()
  })

  it('calls onCreate when FAB is clicked', () => {
    const onCreate = vi.fn()
    render(<BottomNav onCreate={onCreate} />)
    fireEvent.click(screen.getByLabelText('nav.createHabit'))
    expect(onCreate).toHaveBeenCalled()
  })

  it('highlights active route for home', () => {
    mockPathname = '/'
    render(<BottomNav />)
    const homeLink = screen.getByText('nav.habits').closest('a')
    expect(homeLink?.className).toContain('text-primary')
  })

  it('highlights active route for chat', () => {
    mockPathname = '/chat'
    render(<BottomNav />)
    const chatLink = screen.getByText('nav.chat').closest('a')
    expect(chatLink?.className).toContain('text-primary')
  })

  it('does not highlight inactive routes', () => {
    mockPathname = '/'
    render(<BottomNav />)
    const chatLink = screen.getByText('nav.chat').closest('a')
    expect(chatLink?.className).toContain('text-text-secondary')
  })

  it('shows active indicator dot for current page', () => {
    mockPathname = '/profile'
    const { container } = render(<BottomNav />)
    const profileLink = screen.getByText('nav.profile').closest('a')
    const dot = profileLink?.querySelector('.bg-primary')
    expect(dot).toBeInTheDocument()
  })

  it('resets date and view when home is clicked on home page', () => {
    mockPathname = '/'
    mockSetSelectedDate.mockClear()
    mockSetActiveView.mockClear()
    render(<BottomNav />)
    fireEvent.click(screen.getByText('nav.habits'))
    expect(mockSetSelectedDate).toHaveBeenCalledWith('2025-06-15')
    expect(mockSetActiveView).toHaveBeenCalledWith('today')
  })
})

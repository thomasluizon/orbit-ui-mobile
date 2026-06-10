import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

let mockTheme = 'dark'
const mockToggle = vi.fn()

vi.mock('@/hooks/use-color-scheme', () => ({
  useColorScheme: () => ({
    currentTheme: mockTheme,
    toggleTheme: mockToggle,
  }),
}))

import { ThemeToggle } from '@/components/ui/theme-toggle'

describe('ThemeToggle', () => {
  it('renders the theme switch', () => {
    mockTheme = 'dark'
    render(<ThemeToggle />)
    expect(screen.getByRole('switch')).toBeInTheDocument()
  })

  it('shows switch-to-light label in dark mode', () => {
    mockTheme = 'dark'
    render(<ThemeToggle />)
    expect(screen.getByLabelText('settings.theme.switchToLight')).toBeInTheDocument()
  })

  it('shows switch-to-dark label in light mode', () => {
    mockTheme = 'light'
    render(<ThemeToggle />)
    expect(screen.getByLabelText('settings.theme.switchToDark')).toBeInTheDocument()
  })

  it('calls toggleTheme on click', () => {
    mockTheme = 'dark'
    mockToggle.mockClear()
    render(<ThemeToggle />)
    fireEvent.click(screen.getByRole('switch'))
    expect(mockToggle).toHaveBeenCalled()
  })

  it('is checked in dark mode and unchecked in light mode', () => {
    mockTheme = 'dark'
    const { unmount } = render(<ThemeToggle />)
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true')
    unmount()

    mockTheme = 'light'
    render(<ThemeToggle />)
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false')
  })
})

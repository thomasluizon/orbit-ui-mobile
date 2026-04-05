import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

const mockLogout = vi.fn()
const mockPush = vi.fn()
let mockExpiresAt: number | null = null

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    if (params) return `${key}(${JSON.stringify(params)})`
    return key
  },
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}))

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: () => ({
    get expiresAt() {
      return mockExpiresAt
    },
    logout: mockLogout,
  }),
}))

import { ExpiryWarning } from '@/components/ui/expiry-warning'

describe('ExpiryWarning', () => {
  beforeEach(() => {
    mockLogout.mockClear()
    mockPush.mockClear()
    mockExpiresAt = null
  })

  it('renders nothing when expiresAt is null', () => {
    const { container } = render(<ExpiryWarning />)
    expect(container.innerHTML).toBe('')
  })

  it('renders nothing when session is far from expiring', () => {
    mockExpiresAt = Date.now() + 60 * 60000 // 60 minutes from now
    const { container } = render(<ExpiryWarning />)
    expect(container.innerHTML).toBe('')
  })

  it('shows warning when session is about to expire', () => {
    mockExpiresAt = Date.now() + 3 * 60000 // 3 minutes from now
    render(<ExpiryWarning />)
    const alert = screen.getByRole('alert')
    expect(alert).toBeInTheDocument()
  })

  it('shows expired state when time has passed', () => {
    mockExpiresAt = Date.now() - 1000 // Already expired
    render(<ExpiryWarning />)
    expect(screen.getByText('auth.sessionExpired')).toBeInTheDocument()
  })

  it('shows refresh button for expiring session', () => {
    mockExpiresAt = Date.now() + 2 * 60000
    render(<ExpiryWarning />)
    expect(screen.getByText('auth.refresh')).toBeInTheDocument()
  })

  it('shows login button for expired session', () => {
    mockExpiresAt = Date.now() - 1000
    render(<ExpiryWarning />)
    expect(screen.getByText('auth.login')).toBeInTheDocument()
  })

  it('calls logout and navigates to login when button clicked', () => {
    mockExpiresAt = Date.now() - 1000
    render(<ExpiryWarning />)
    fireEvent.click(screen.getByText('auth.login'))
    expect(mockLogout).toHaveBeenCalled()
    expect(mockPush).toHaveBeenCalledWith('/login')
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

const mockLogout = vi.fn()
let mockSessionRefreshFailed = false

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    if (params) return `${key}(${JSON.stringify(params)})`
    return key
  },
}))

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: () => ({
    get sessionRefreshFailed() {
      return mockSessionRefreshFailed
    },
    logout: mockLogout,
  }),
}))

import { ExpiryWarning } from '@/components/ui/expiry-warning'

describe('ExpiryWarning', () => {
  beforeEach(() => {
    mockLogout.mockClear()
    mockSessionRefreshFailed = false
  })

  it('renders nothing while silent session refreshes succeed', () => {
    const { container } = render(<ExpiryWarning />)
    expect(container.innerHTML).toBe('')
  })

  it('shows the signed-out message only after refresh fails', () => {
    mockSessionRefreshFailed = true
    render(<ExpiryWarning />)
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByText('auth.sessionSignedOut')).toBeInTheDocument()
  })

  it('offers sign in after refresh fails and never offers refresh', () => {
    mockSessionRefreshFailed = true
    render(<ExpiryWarning />)
    expect(screen.getByText('auth.login')).toBeInTheDocument()
    expect(screen.queryByText('auth.refresh')).not.toBeInTheDocument()
  })

  it('navigates through logout when sign in is clicked', () => {
    mockSessionRefreshFailed = true
    render(<ExpiryWarning />)
    fireEvent.click(screen.getByText('auth.login'))
    expect(mockLogout).toHaveBeenCalled()
  })
})

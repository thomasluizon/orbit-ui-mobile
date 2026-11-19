import { describe, it, expect, vi, beforeEach } from 'vitest'
import { enableTestFlags } from '@orbit/shared/test-support/flag-state'
import { render, screen, fireEvent } from '@testing-library/react'
import { StrictMode } from 'react'

const mockLogout = vi.fn()
const { replace } = vi.hoisted(() => ({ replace: vi.fn() }))
let mockSessionRefreshFailed = false

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }))
const motion = vi.hoisted(() => ({ reducedMotion: false }))
vi.mock('@/hooks/use-viewport-match', () => ({
  useViewportMatch: (query: string) => query.includes('prefers-reduced-motion') ? motion.reducedMotion : false,
}))
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
    replace.mockClear()
    mockSessionRefreshFailed = false
  })

  it('renders nothing while silent session refreshes succeed', () => {
    const { container } = render(<ExpiryWarning />)
    expect(container.innerHTML).toBe('')
    expect(replace).not.toHaveBeenCalled()
  })

  it('routes a confirmed ended session to sign in once across repeated renders', () => {
    mockSessionRefreshFailed = true
    const mounted = render(<StrictMode><ExpiryWarning /></StrictMode>)
    mounted.rerender(<StrictMode><ExpiryWarning /></StrictMode>)

    expect(replace).toHaveBeenCalledExactlyOnceWith('/login')
    expect(mockLogout).not.toHaveBeenCalled()
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

  it('uses the shared small ghost pill for recovery', () => {
    mockSessionRefreshFailed = true
    render(<ExpiryWarning />)
    const action = screen.getByRole('button', { name: 'auth.login' })
    expect(action).toHaveAttribute('data-size', 'sm')
    expect(action).toHaveAttribute('data-variant', 'ghost')
  })

  it.each([false, true])('keeps the message and the sign in action, and shows Orbit in Parado only with the guided flows on (%s)', (guided) => {
    if (guided) enableTestFlags('orbit_guided_flows')
    mockSessionRefreshFailed = true
    render(<ExpiryWarning />)
    expect(screen.getByText('auth.sessionSignedOut')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'auth.login' })).toBeInTheDocument()
    expect(document.querySelectorAll('[data-orbit-face="rig"][data-orbit-state="parado"]')).toHaveLength(guided ? 1 : 0)
    expect(document.querySelector('[data-orbit-state="feliz"]')).toBeNull()
  })

  it.each([[false, 'running'], [true, 'still']] as const)('draws Orbit with reduced motion %s as %s, with the guided flows on', (reducedMotion, loop) => {
    enableTestFlags('orbit_guided_flows')
    motion.reducedMotion = reducedMotion
    mockSessionRefreshFailed = true
    try {
      render(<ExpiryWarning />)
      expect(document.querySelector('[data-orbit-face="rig"]')).toHaveAttribute('data-orbit-loop', loop)
    } finally {
      motion.reducedMotion = false
    }
  })

  it('signs the person out and routes to sign in from the action, with the guided flows on', () => {
    enableTestFlags('orbit_guided_flows')
    mockSessionRefreshFailed = true
    render(<ExpiryWarning />)
    expect(replace).toHaveBeenCalledExactlyOnceWith('/login')
    fireEvent.click(screen.getByRole('button', { name: 'auth.login' }))
    expect(mockLogout).toHaveBeenCalledTimes(1)
  })

  it('navigates through logout when sign in is clicked', () => {
    mockSessionRefreshFailed = true
    render(<ExpiryWarning />)
    fireEvent.click(screen.getByText('auth.login'))
    expect(mockLogout).toHaveBeenCalled()
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

const { mockResolveMotionPreset, mockUseReducedMotion } = vi.hoisted(() => ({
  mockUseReducedMotion: vi.fn(() => true),
  mockResolveMotionPreset: vi.fn(
    (scenario: string, reducedMotionEnabled = false) => ({
      scenario,
      enterDuration: 120,
      exitDuration: 90,
      enterEasing: [0, 0, 1, 1] as const,
      exitEasing: [0, 0, 1, 1] as const,
      shift: reducedMotionEnabled ? 0 : 12,
      scaleFrom: 1,
      scaleTo: 1,
      spring: 'soft' as const,
      reducedMotionEnabled,
    }),
  ),
}))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) =>
    params ? `${key}:${JSON.stringify(params)}` : key,
  useLocale: () => 'en',
}))

vi.mock('motion/react', () => {
  const React = require('react')
  const motion = new Proxy(
    {},
    {
      get: (_target, key: string) =>
        React.forwardRef(function MockMotionComponent(
          props: Record<string, unknown> & { children?: React.ReactNode },
          ref: React.ForwardedRef<unknown>,
        ) {
          const { children, ...rest } = props
          return React.createElement(key, { ...rest, ref }, children)
        }),
    },
  )

  return {
    AnimatePresence: ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
    motion,
    useReducedMotion: mockUseReducedMotion,
  }
})

vi.mock('@orbit/shared/theme', () => ({
  resolveMotionPreset: mockResolveMotionPreset,
}))

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}))

const mockPush = vi.fn()
const mockSearchParams = {
  get: (key: string) => {
    if (key === 'email') return 'person@example.com'
    if (key === 'code') return '123456'
    if (key === 'returnUrl') return '/'
    return null
  },
}
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
  useSearchParams: () => mockSearchParams,
}))

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: () => ({ setAuth: vi.fn() }),
}))

vi.mock('@/lib/supabase', () => ({
  getSupabaseClient: () => ({
    auth: {
      signInWithOAuth: vi.fn(),
    },
  }),
}))

import LoginPage from '@/app/(auth)/login/page'

describe('LoginPage', () => {
  beforeEach(() => {
    mockPush.mockClear()
    mockResolveMotionPreset.mockClear()
    mockUseReducedMotion.mockReset()
    mockUseReducedMotion.mockReturnValue(true)
  })

  it('keeps the login card at a wider minimum size on larger small screens', () => {
    const { container } = render(<LoginPage />)

    expect(container.firstChild).toHaveClass('max-w-[26rem]')
    expect(container.firstChild).toHaveClass('min-[480px]:min-w-[22rem]')
  })

  it('groups the verification code inputs and exposes one-time-code autocomplete', async () => {
    render(<LoginPage />)

    await waitFor(() => {
      expect(screen.getByRole('group')).toBeInTheDocument()
    })

    const inputs = screen.getAllByRole('textbox')
    expect(inputs).toHaveLength(6)
    expect(inputs[0]).toHaveAttribute('autocomplete', 'one-time-code')
  })

  it('resolves auth motion presets with the reduced-motion preference', () => {
    render(<LoginPage />)

    expect(mockResolveMotionPreset).toHaveBeenCalledWith('route-replace', true)
    expect(mockResolveMotionPreset).toHaveBeenCalledWith('success-feedback', true)
  })
})

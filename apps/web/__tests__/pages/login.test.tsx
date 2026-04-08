import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) =>
    params ? `${key}:${JSON.stringify(params)}` : key,
  useLocale: () => 'en',
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
})

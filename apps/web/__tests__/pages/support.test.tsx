import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}))

vi.mock('@/hooks/use-go-back-or-fallback', () => ({
  useGoBackOrFallback: () => vi.fn(),
}))

let mockProfile: Record<string, unknown> | null = null
let mockIsOnline = false

vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({ profile: mockProfile }),
}))

vi.mock('@/hooks/use-offline', () => ({
  useOffline: () => ({ isOnline: mockIsOnline }),
}))

vi.mock('@orbit/shared/api', () => ({
  API: {
    support: { send: '/api/support/send' },
  },
}))

vi.mock('@orbit/shared/utils', () => ({
  buildSupportRequestBody: (
    profile: Record<string, unknown> | null,
    fields: { name: string; email: string; subject: string; message: string },
  ) => ({
    name: fields.name.trim() || profile?.name,
    email: fields.email.trim() || profile?.email,
    subject: fields.subject.trim(),
    message: fields.message.trim(),
  }),
  getErrorMessage: (_err: unknown, fallback: string) => fallback,
}))

vi.mock('@/components/ui/offline-unavailable-state', () => ({
  OfflineUnavailableState: ({ title, description }: { title: string; description: string }) => (
    <div role="alert">
      <span>{title}</span>
      <span>{description}</span>
    </div>
  ),
}))

vi.mock('@/app/actions/profile', () => ({}))

import SupportPage from '@/app/(app)/support/page'

describe('SupportPage', () => {
  beforeEach(() => {
    mockProfile = { name: 'Orbit User', email: 'orbit@example.com' }
    mockIsOnline = false
    vi.stubGlobal('fetch', vi.fn())
  })

  it('shows an explicit offline state and disables sending when offline', () => {
    render(<SupportPage />)

    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'profile.support.send' })).toBeDisabled()
  })
})

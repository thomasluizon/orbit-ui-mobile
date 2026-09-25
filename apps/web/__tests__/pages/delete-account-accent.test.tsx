import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { expect, it, vi } from 'vitest'
import en from '@orbit/shared/i18n/en.json'
import DeleteAccountPage from '@/app/(public)/delete-account/page'
import PublicLayout from '@/app/(public)/layout'

vi.mock('next/navigation', () => ({ usePathname: () => '/delete-account' }))
vi.mock('@/hooks/use-go-back-or-fallback', () => ({
  useGoBackOrFallback: () => vi.fn(),
}))
vi.mock('@/stores/auth-store', () => ({
  useAuthStore: (select: (state: { isAuthenticated: boolean }) => boolean) =>
    select({ isAuthenticated: false }),
}))

it('renders the account deletion contact link on the canvas with its canvas accent role', () => {
  const { container } = render(
    <NextIntlClientProvider locale="en" messages={en}>
      <PublicLayout>
        <DeleteAccountPage />
      </PublicLayout>
    </NextIntlClientProvider>,
  )

  const link = screen.getByRole('link', { name: en.deleteAccount.webFallback.button })
  expect(link).toHaveAttribute('href', 'mailto:contact@useorbit.org?subject=Account%20deletion%20request')
  expect(link).toHaveClass('orbit-link-action')
  expect(link.parentElement).toHaveStyle({ color: 'var(--primary-soft)' })
  expect(link.style.textDecoration).toBe('')
  expect(container.querySelector('[class*="max-w-[var(--app-max-w)]"]')).toHaveClass('bg-[var(--bg)]')
})

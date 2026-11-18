import { render, screen } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { TodayPageClient } from '@/app/(app)/today-page-client'

const state = vi.hoisted(() => ({ isError: false }))

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
vi.mock('@/hooks/use-profile', () => ({
  PreloadedProfileContext: { Provider: ({ children }: { children: React.ReactNode }) => <>{children}</> },
  useProfile: () => ({ profile: undefined, isError: state.isError, refetch: vi.fn() }),
}))
vi.mock('@/app/(app)/use-today-page', () => ({ useTodayPage: () => { throw new Error('Today content must not mount before the profile arrives') } }))

beforeEach(() => { state.isError = false })

it('draws the date header skeleton and the habit list skeleton, and no other skeleton, while the profile is pending', () => {
  const view = render(<TodayPageClient initialToday="2026-09-04" initialHabits={null} />)
  const status = screen.getByRole('status', { name: 'profile.loading' })
  expect(status).toHaveAttribute('aria-busy', 'true')
  expect(screen.getByRole('heading', { name: 'nav.today', hidden: true })).toBeInTheDocument()
  expect(view.container.querySelectorAll('[data-variant="settings"]')).toHaveLength(1)
  const list = status.querySelector('[aria-busy="true"]')
  expect(list).not.toBeNull()
  expect(list!.querySelectorAll('[data-variant="habit-row"]')).toHaveLength(5)
  expect(status.querySelectorAll('[data-variant]')).toHaveLength(6)
})

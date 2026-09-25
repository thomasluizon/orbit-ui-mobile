import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { buildAccountScopedStorageKey } from '@orbit/shared/utils'
import { holdAccount, replaceAccountWith } from '@/__tests__/support/account-change'

const LEGACY_KEY = 'orbit_trial_expired_seen'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/',
}))
vi.mock('next-intl', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next-intl')>()
  const messages = (await import('@orbit/shared/i18n/en.json')).default
  return {
    ...actual,
    useLocale: () => 'en',
    useTranslations: () => actual.createTranslator({ locale: 'en', messages }),
  }
})
vi.mock('@/components/ui/sheet', async () => await import('@/__tests__/support/sheet-double'))
vi.mock('@/hooks/use-profile', () => ({ useTrialExpired: () => true }))
vi.mock('@/hooks/use-subscription-plans', () => ({
  useSubscriptionPlans: () => ({ plans: null }),
}))

import { TrialExpiredModal } from '@/components/ui/trial-expired-modal'

function noticeHeading() {
  return screen.queryByText('Your Pro trial has ended')
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
  localStorage.clear()
  holdAccount('user-1')
})

afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

it('shows the trial notice to the next account after the previous one dismissed it', async () => {
  const { rerender } = render(<TrialExpiredModal />)
  expect(noticeHeading()).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Stay free' }))
  act(() => {})
  expect(noticeHeading()).not.toBeInTheDocument()
  expect(localStorage.getItem(buildAccountScopedStorageKey(LEGACY_KEY, 'user-1'))).toBe('1')

  await replaceAccountWith('user-2')
  rerender(<TrialExpiredModal />)

  expect(noticeHeading()).toBeInTheDocument()
})

it('gives the pre-rename dismissal to the account signed in now and then consumes it', () => {
  localStorage.setItem(LEGACY_KEY, '1')

  render(<TrialExpiredModal />)

  expect(noticeHeading()).not.toBeInTheDocument()
  expect(localStorage.getItem(LEGACY_KEY)).toBeNull()
  expect(localStorage.getItem(buildAccountScopedStorageKey(LEGACY_KEY, 'user-1'))).toBe('1')
})

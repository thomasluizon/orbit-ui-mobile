import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { getStepUpStorageKey } from '@orbit/shared/utils'
import { getHeldAccountId, useAuthStore } from '@/stores/auth-store'
import { replaceAccountWith, respondWithAccount } from '@/__tests__/support/account-change'

const mocks = vi.hoisted(() => ({ router: { replace: vi.fn() }, serverAuthFetch: vi.fn() }))

vi.mock('next/navigation', () => ({
  useRouter: () => mocks.router,
  useSearchParams: () => new URLSearchParams('operation=delete'),
}))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) =>
    params ? `${key}:${JSON.stringify(params)}` : key,
}))

vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({ profile: { email: 'person@example.com', hasProAccess: false } }),
}))
vi.mock('@/hooks/use-date-format', () => ({
  useDateFormat: () => ({ displayDate: (value: string) => `local:${value}` }),
}))
vi.mock('@/lib/server-fetch', () => ({
  serverAuthFetch: (...args: unknown[]) => mocks.serverAuthFetch(...args),
}))
vi.mock('@/components/shell/flow-shell', () => ({
  FlowShell: ({ children, action }: Readonly<{
    children: React.ReactNode
    action?: React.ReactNode
  }>) => (
    <main>
      <section>{children}</section>
      <footer data-testid="shell-action">{action}</footer>
    </main>
  ),
}))

import { StepUpScreen } from '@/app/step-up/step-up-screen'

function storeLiveChallenge(accountId: string) {
  globalThis.localStorage.setItem(
    getStepUpStorageKey('delete', accountId),
    JSON.stringify({ operation: 'delete', sentAt: Date.now() }),
  )
}

beforeEach(() => {
  globalThis.localStorage.clear()
  vi.stubGlobal('fetch', vi.fn())
  respondWithAccount('user-1')
})

afterEach(async () => {
  cleanup()
  await act(async () => {})
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

/**
 * The reload a person does when they leave the tab to read the emailed code. Nothing on this route
 * has ever observed a session, so the held account is null and only the proxy knows who they are.
 * The null precondition is asserted rather than assumed, because every later test in this file
 * records an account into the same module variable.
 */
it('renders the live challenge on a cold load that has observed no session', async () => {
  expect(getHeldAccountId()).toBeNull()
  storeLiveChallenge('user-1')

  render(<StepUpScreen serverAccountId="user-1" />)

  expect(mocks.router.replace).not.toHaveBeenCalled()
  expect(screen.getByLabelText('codeLabel')).toBeInTheDocument()
})

it('starts the session monitor, so the route learns the account it was never told', async () => {
  storeLiveChallenge('user-1')

  await act(async () => {
    render(<StepUpScreen serverAccountId="user-1" />)
  })

  await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledWith('/api/auth/session'))
})

/**
 * `#622`: the replacement this route could not see. The next account owns no record under their own
 * key, so the challenge, the code typed into it and the scheduled deletion date all leave with it.
 */
it('returns to Profile when another account replaces the tab mid challenge', async () => {
  storeLiveChallenge('user-1')
  await act(async () => {
    await useAuthStore.getState().checkSession()
  })

  await act(async () => {
    render(<StepUpScreen serverAccountId="user-1" />)
  })
  expect(screen.getByLabelText('codeLabel')).toBeInTheDocument()

  await replaceAccountWith('user-2')

  await waitFor(() => expect(mocks.router.replace).toHaveBeenCalledWith('/profile'))
  expect(screen.queryByLabelText('codeLabel')).not.toBeInTheDocument()
})

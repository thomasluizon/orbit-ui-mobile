import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  STEP_UP_ATTEMPT_WINDOW_MS,
  STEP_UP_CHALLENGE_DURATION_MS,
  type StepUpTimingRecord,
} from '@orbit/shared/utils'
import { API } from '@orbit/shared/api'

const mocks = vi.hoisted(() => ({
  beginChallenge: vi.fn(),
  clearTiming: vi.fn(),
  logout: vi.fn(),
  markAttemptFailed: vi.fn(),
  markExhausted: vi.fn(),
  operation: 'delete',
  profile: {
    email: 'person@example.com',
    hasProAccess: false,
    planExpiresAt: null as string | null,
  },
  readTiming: vi.fn(),
  replace: vi.fn(),
  router: { replace: vi.fn() },
  serverAuthFetch: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => mocks.router,
  useSearchParams: () => new URLSearchParams(`operation=${mocks.operation}`),
}))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) =>
    params ? `${key}:${JSON.stringify(params)}` : key,
}))

vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: mocks.profile }) }))
vi.mock('@/hooks/use-date-format', () => ({
  useDateFormat: () => ({ displayDate: (value: string) => `local:${value}` }),
}))
vi.mock('@/stores/auth-store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({
    user: { email: 'session@example.com' },
    logout: mocks.logout,
  }),
}))
vi.mock('@/lib/server-fetch', () => ({
  serverAuthFetch: (...args: unknown[]) => mocks.serverAuthFetch(...args),
}))
vi.mock('@/lib/step-up-storage', () => ({
  beginStepUpChallenge: (operation: string) => mocks.beginChallenge(operation),
  clearStepUpTiming: (operation: string) => mocks.clearTiming(operation),
  markStepUpAttemptFailed: (record: unknown) => mocks.markAttemptFailed(record),
  markStepUpExhausted: (record: unknown) => mocks.markExhausted(record),
  readStepUpTiming: (operation: string) => mocks.readTiming(operation),
}))
vi.mock('@/components/shell/flow-shell', () => ({
  FlowShell: ({ children, action }: Readonly<{ children: React.ReactNode; action?: React.ReactNode }>) => (
    <main>
      <section>{children}</section>
      <footer data-testid="shell-action">{action}</footer>
    </main>
  ),
}))

import { StepUpScreen } from '@/app/step-up/page'

function liveRecord(offset = 0) {
  return { operation: 'delete' as const, sentAt: Date.now() - offset }
}

function backendError(errorCode: string, error: string) {
  return { data: { error, errorCode } }
}

async function renderLiveScreen(record: StepUpTimingRecord = liveRecord()) {
  mocks.readTiming.mockReturnValue(record)
  render(<StepUpScreen />)
  return screen.findByLabelText('codeLabel')
}

function enterCode(code = '123456') {
  fireEvent.change(screen.getByLabelText('codeLabel'), { target: { value: code } })
}

function clickConfirm() {
  fireEvent.click(within(screen.getByTestId('shell-action')).getByRole('button'))
}

describe('web step up screen', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.operation = 'delete'
    mocks.router.replace = mocks.replace
    mocks.profile.email = 'person@example.com'
    mocks.profile.hasProAccess = false
    mocks.profile.planExpiresAt = null
    mocks.serverAuthFetch.mockImplementation((endpoint: string) => {
      if (endpoint === API.auth.confirmDeletion) {
        return Promise.resolve({
          message: 'Account deactivated',
          scheduledDeletionAt: '2026-09-04T03:00:00Z',
        })
      }
      if (endpoint === API.auth.requestDeletion) {
        return Promise.resolve({ message: 'Deletion code sent' })
      }
      if (endpoint === API.apiKeys.requestCreationChallenge) {
        return Promise.resolve({ message: 'API key creation code sent' })
      }
      return Promise.resolve({ message: 'API key creation confirmed' })
    })
    mocks.beginChallenge.mockImplementation((operation: 'delete' | 'keys') => ({
      operation,
      sentAt: Date.now(),
    }))
    mocks.markExhausted.mockImplementation((record: { operation: 'delete'; sentAt: number }) => ({
      ...record,
      exhaustedAt: Date.now(),
    }))
    mocks.markAttemptFailed.mockImplementation((record: {
      operation: 'delete'
      sentAt: number
      failedAttempts?: number
    }) => ({
      ...record,
      failedAttempts: (record.failedAttempts ?? 0) + 1,
    }))
  })

  it('enables confirm only when all six digits are present', async () => {
    const input = await renderLiveScreen()
    const confirm = within(screen.getByTestId('shell-action')).getByText('confirm').closest('button')

    expect(confirm).toBeDisabled()
    fireEvent.change(input, { target: { value: '12345' } })
    expect(confirm).toBeDisabled()
    fireEvent.change(input, { target: { value: '123456' } })
    expect(confirm).toBeEnabled()
  })

  it('blocks editing and exposes the confirm loading state while checking', async () => {
    let resolveConfirmation: ((value: {
      message: string
      scheduledDeletionAt: string
    }) => void) | undefined
    mocks.serverAuthFetch.mockImplementation((endpoint: string) => {
      if (endpoint === API.auth.confirmDeletion) {
        return new Promise((resolve) => {
          resolveConfirmation = resolve
        })
      }
      return Promise.resolve({ message: 'Challenge accepted' })
    })
    const input = await renderLiveScreen()
    enterCode()
    clickConfirm()

    await waitFor(() => expect(mocks.serverAuthFetch).toHaveBeenCalledWith(
      API.auth.confirmDeletion,
      { method: 'POST', body: JSON.stringify({ code: '123456' }) },
    ))
    await waitFor(() => expect(input).toBeDisabled())
    expect(screen.getByTestId('shell-action').querySelector('button')).toHaveAttribute('aria-busy', 'true')

    resolveConfirmation?.({
      message: 'Account deactivated',
      scheduledDeletionAt: '2026-09-04T03:00:00Z',
    })
  })

  it('keeps a wrong code editable, rings all cells, and uses the server count', async () => {
    mocks.operation = 'keys'
    mocks.serverAuthFetch.mockRejectedValueOnce(
      backendError('INVALID_VERIFICATION_CODE', 'Invalid code. Remaining attempts: 2'),
    )
    const input = await renderLiveScreen({ operation: 'keys', sentAt: Date.now() })
    enterCode()
    clickConfirm()

    expect(await screen.findByRole('alert')).toHaveTextContent('attemptsMany:{"count":2}')
    expect(input).toBeEnabled()
    expect(input).toHaveValue('123456')
    expect(document.querySelectorAll('[data-otp-cell][data-error]')).toHaveLength(6)
  })

  it('does not invent an attempts line when the server omits the count', async () => {
    mocks.serverAuthFetch.mockRejectedValueOnce(
      backendError('INVALID_VERIFICATION_CODE', 'Invalid code'),
    )
    await renderLiveScreen()
    enterCode()
    clickConfirm()

    expect(await screen.findByRole('alert')).toHaveTextContent('wrong')
    expect(screen.getByRole('alert')).not.toHaveTextContent('attemptsMany')
  })

  it('moves the third wrong code to the persisted exhausted boundary', async () => {
    mocks.serverAuthFetch.mockRejectedValue(
      backendError('INVALID_VERIFICATION_CODE', 'Invalid code'),
    )
    await renderLiveScreen()
    enterCode()

    clickConfirm()
    await waitFor(() => expect(mocks.markAttemptFailed).toHaveBeenCalledTimes(1))
    clickConfirm()
    await waitFor(() => expect(mocks.markAttemptFailed).toHaveBeenCalledTimes(2))
    clickConfirm()

    expect(await screen.findByText('exhaustedNotice')).toBeInTheDocument()
    expect(mocks.markExhausted).toHaveBeenCalledOnce()
    expect(screen.getByText('backToProfile')).toBeInTheDocument()
    expect(screen.queryByText('confirm')).not.toBeInTheDocument()
    expect(screen.queryByText('resend')).not.toBeInTheDocument()
    expect(screen.queryByText('cancel')).not.toBeInTheDocument()
  })

  it('mounts an active lock without offering a new challenge', async () => {
    const now = Date.now()
    mocks.readTiming.mockReturnValue({
      operation: 'delete',
      sentAt: now,
      exhaustedAt: now - STEP_UP_ATTEMPT_WINDOW_MS + 10_000,
    })
    render(<StepUpScreen />)

    expect(await screen.findByText('exhaustedNotice')).toBeInTheDocument()
    expect(screen.queryByText('resend')).not.toBeInTheDocument()
    expect(mocks.serverAuthFetch).not.toHaveBeenCalled()
  })

  it('shows a cooldown on arrival and a ghost resend only after it is ready', async () => {
    await renderLiveScreen()
    expect(screen.getByText(/cooldown/)).toBeInTheDocument()
    expect(screen.queryByText('resend')).not.toBeInTheDocument()

    mocks.readTiming.mockReturnValue(liveRecord(60_000))
    render(<StepUpScreen />)
    expect((await screen.findByText('resend')).closest('button')).toHaveAttribute('data-variant', 'ghost')
  })

  it('restarts and hides the cooldown when a new challenge is sent', async () => {
    await renderLiveScreen(liveRecord(60_000))
    fireEvent.click(screen.getByText('resend'))

    await waitFor(() => expect(mocks.serverAuthFetch).toHaveBeenCalledWith(
      API.auth.requestDeletion,
      { method: 'POST' },
    ))
    expect(mocks.beginChallenge).toHaveBeenCalledWith('delete')
    expect(screen.getByText(/cooldown/)).toBeInTheDocument()
    expect(screen.queryByText('resend')).not.toBeInTheDocument()
  })

  it('disables an expired code and uses the sole filled action for a new code', async () => {
    const input = await renderLiveScreen(liveRecord(STEP_UP_CHALLENGE_DURATION_MS))
    expect(input).toBeDisabled()
    const action = screen.getByTestId('shell-action')
    expect(within(action).getByText('resend').closest('button')).toHaveAttribute('data-variant', 'primary')
    expect(screen.queryByText('confirm')).not.toBeInTheDocument()
  })

  it('renders the endpoint date in the device format and signs out', async () => {
    await renderLiveScreen()
    enterCode()
    clickConfirm()

    expect(await screen.findByText(/successTitle/)).toHaveTextContent(
      'local:2026-09-04T03:00:00Z',
    )
    fireEvent.click(screen.getByText('signOut'))
    expect(mocks.logout).toHaveBeenCalledOnce()
  })

  it('renders the API scheduled deletion date in the Pro success line', async () => {
    mocks.profile.hasProAccess = true
    mocks.profile.planExpiresAt = '2026-08-30T03:00:00Z'
    await renderLiveScreen()
    enterCode()
    clickConfirm()

    expect(await screen.findByText(/successPro/)).toHaveTextContent(
      'local:2026-09-04T03:00:00Z',
    )
  })

  it('routes cancel to Profile', async () => {
    await renderLiveScreen()
    fireEvent.click(screen.getByText('cancel'))
    expect(mocks.replace).toHaveBeenCalledWith('/profile')
  })

  it('confirms API key creation and returns to the creation handoff', async () => {
    mocks.operation = 'keys'
    mocks.readTiming.mockReturnValue({ operation: 'keys', sentAt: Date.now() })
    render(<StepUpScreen />)
    await screen.findByLabelText('codeLabel')
    enterCode()
    clickConfirm()

    await waitFor(() => expect(mocks.serverAuthFetch).toHaveBeenCalledWith(
      API.apiKeys.confirmCreationChallenge,
      { method: 'POST', body: JSON.stringify({ code: '123456' }) },
    ))
    expect(mocks.clearTiming).toHaveBeenCalledWith('keys')
    expect(mocks.replace).toHaveBeenCalledWith('/advanced?create-key=1')
  })
})

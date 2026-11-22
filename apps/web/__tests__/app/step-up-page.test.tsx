import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest'
import {
  STEP_UP_ATTEMPT_WINDOW_MS,
  STEP_UP_CHALLENGE_DURATION_MS,
  type StepUpTimingRecord,
} from '@orbit/shared/utils'
import { API } from '@orbit/shared/api'

const PINNED_TEST_TIME = new Date('2026-09-12T09:00:00.000Z')
vi.setSystemTime(PINNED_TEST_TIME)
beforeEach(() => vi.setSystemTime(PINNED_TEST_TIME))
afterEach(() => vi.useRealTimers())

import { UnrecognizedActionError } from 'next/dist/client/components/unrecognized-action-error'
import { setApiFetchTranslate } from '@/lib/api-fetch'
import { captureGuidedFlowEvent } from '@/lib/posthog'
import { useVersionGateStore } from '@/stores/version-gate-store'

const mocks = vi.hoisted(() => ({
  beginChallenge: vi.fn(),
  staleAction: false,
  clearTiming: vi.fn(),
  logout: vi.fn(),
  markAttemptFailed: vi.fn(),
  markExhausted: vi.fn(),
  markVerified: vi.fn(),
  operation: 'delete',
  profile: {
    email: 'person@example.com',
    hasProAccess: false,
    planExpiresAt: null as string | null,
  },
  readTiming: vi.fn(),
  replace: vi.fn(),
  stopMonitor: vi.fn(),
  router: { replace: vi.fn() },
  serverAuthMutate: vi.fn(),
  heldAccountId: 'account-a',
  
  flowCompleted: vi.fn(),
}))

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => mocks.router,
  useSearchParams: () => new URLSearchParams(`operation=${mocks.operation}`),
}))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) =>
    params ? `${key}:${JSON.stringify(params)}` : key,
}))

vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: mocks.profile }) }))
vi.mock('@/lib/posthog', async (importOriginal) => ({ ...await importOriginal<typeof import('@/lib/posthog')>(), captureGuidedFlowEvent: vi.fn(), captureGuidedFlowCompleted: mocks.flowCompleted }))
vi.mock('@/hooks/use-date-format', () => ({
  useDateFormat: () => ({ displayDate: (value: string) => `local:${value}`, displayDateNumeric: (value: string) => `numeric:${value}` }),
}))
vi.mock('@/stores/auth-store', () => {
  const state = {
    user: { email: 'session@example.com' },
    logout: mocks.logout,
    confirmSessionRefreshFailure: vi.fn(),
    recoverSessionRefreshFailure: vi.fn(),
    startExpiryMonitor: () => mocks.stopMonitor,
  }
  return {
    useAuthStore: Object.assign(
      (selector: (current: unknown) => unknown) => selector(state),
      { getState: () => state },
    ),
    getHeldAccountId: () => mocks.heldAccountId,
    useHeldAccountId: () => mocks.heldAccountId,
  }
})
vi.mock('@/app/actions/auth', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/app/actions/auth')>()
  return { ...original, confirmDeletion: (...arguments_: Parameters<typeof original.confirmDeletion>) => {
    if (mocks.staleAction) return Promise.reject(new UnrecognizedActionError('Unknown action'))
    return original.confirmDeletion(...arguments_)
  } }
})
vi.mock('@/lib/server-fetch', () => ({
  serverAuthMutate: (...args: unknown[]) => mocks.serverAuthMutate(...args),
}))
vi.mock('@/lib/step-up-storage', () => ({
  beginStepUpChallenge: (operation: string, accountId: string | null) =>
    mocks.beginChallenge(operation, accountId),
  clearStepUpTiming: (operation: string, accountId: string | null) =>
    mocks.clearTiming(operation, accountId),
  markStepUpAttemptFailed: (record: unknown, accountId: string | null) =>
    mocks.markAttemptFailed(record, accountId),
  markStepUpExhausted: (record: unknown, accountId: string | null) =>
    mocks.markExhausted(record, accountId),
  markStepUpVerified: (operation: string) => mocks.markVerified(operation),
  readStepUpTiming: (operation: string, accountId: string | null) =>
    mocks.readTiming(operation, accountId),
}))
import { StepUpScreen } from '@/app/step-up/step-up-screen'

function liveRecord(offset = 0) {
  return { operation: 'delete' as const, sentAt: Date.now() - offset }
}

function backendError(errorCode: string, error: string) {
  return { data: { error, errorCode } }
}

async function renderLiveScreen(record: StepUpTimingRecord = liveRecord()) {
  mocks.readTiming.mockReturnValue(record)
  render(<StepUpScreen serverAccountId={null} />)
  return screen.findByLabelText('codeLabel')
}

function enterCode(code = '123456') {
  fireEvent.change(screen.getByLabelText('codeLabel'), { target: { value: code } })
}

function shellAction() {
  return document.querySelector<HTMLElement>('[data-flow-action]')!
}

function filledAction() {
  return document.querySelector<HTMLButtonElement>('[data-flow-primary] button') ?? within(shellAction()).getByRole('button')
}

function clickConfirm() {
  fireEvent.click(filledAction())
}

describe('web step up screen', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.staleAction = false
    useVersionGateStore.setState(useVersionGateStore.getInitialState())
    setApiFetchTranslate((key) => key)
    mocks.operation = 'delete'
    mocks.heldAccountId = 'account-a'
    mocks.router.replace = mocks.replace
    mocks.profile.email = 'person@example.com'
    mocks.profile.hasProAccess = false
    mocks.profile.planExpiresAt = null
    mocks.serverAuthMutate.mockImplementation((endpoint: string) => {
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

  it('keeps confirm enabled with the flag on, and answers a short code with the hint beside the field and focus on the field', async () => {
    const input = await renderLiveScreen()
    const confirm = filledAction()
    expect(confirm).toHaveTextContent('confirm')
    expect(confirm).toBeEnabled()
    fireEvent.change(input, { target: { value: '12345' } })
    expect(confirm).toBeEnabled()
    input.blur()
    await act(async () => { fireEvent.click(confirm) })
    const confirmRequests = () => mocks.serverAuthMutate.mock.calls.filter(([endpoint]) => endpoint === API.auth.confirmDeletion)
    expect(confirmRequests()).toHaveLength(0)
    expect(input).toHaveAccessibleDescription('auth.errors.codeFormat')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveFocus()
    input.blur()
    await act(async () => { fireEvent.click(confirm) })
    expect(input).toHaveFocus()
    fireEvent.change(input, { target: { value: '123456' } })
    expect(input).not.toHaveAttribute('aria-invalid')
    await act(async () => { fireEvent.click(confirm) })
    expect(confirmRequests()).toEqual([[API.auth.confirmDeletion, { method: 'POST', body: JSON.stringify({ code: '123456' }) }, 'account-a']])
  })

  it.each([false, true])('holds one filled action on the code step, and the resend stays quiet (flag %s)', async (guided) => {
    await renderLiveScreen(liveRecord(60_000))
    const filled = [...document.querySelectorAll('button[data-variant="primary"]')].map((button) => button.textContent)
    expect(filled).toHaveLength(1)
    for (const button of screen.getAllByText('resend').map((label) => label.closest('button'))) expect(button).toHaveAttribute('data-variant', 'ghost')
  })

  it('keeps a wrong code editable, rings all cells, and uses the server count', async () => {
    mocks.operation = 'keys'
    mocks.serverAuthMutate.mockRejectedValueOnce(
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
    mocks.serverAuthMutate.mockRejectedValueOnce(
      backendError('INVALID_VERIFICATION_CODE', 'Invalid code'),
    )
    await renderLiveScreen()
    enterCode()
    clickConfirm()

    expect(await screen.findByRole('alert')).toHaveTextContent('wrong')
    expect(screen.getByRole('alert')).not.toHaveTextContent('attemptsMany')
  })

  it('tells the person to reload when the account changes during confirmation', async () => {
    mocks.serverAuthMutate.mockRejectedValueOnce({
      status: 409,
      code: 'ACCOUNT_CHANGED',
      message: 'The signed in account changed before this request ran',
    })
    await renderLiveScreen()
    enterCode()
    clickConfirm()

    expect(await screen.findByRole('alert')).toHaveTextContent('errors.api.accountChanged')
    expect(screen.getByRole('alert')).not.toHaveTextContent('genericError')
  })

  it('does not show deletion success after a different account arrives during confirmation', async () => {
    let finish: ((value: { scheduledDeletionAt: string }) => void) | undefined
    mocks.serverAuthMutate.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
    await renderLiveScreen()
    enterCode()
    clickConfirm()
    await waitFor(() => expect(mocks.serverAuthMutate).toHaveBeenCalledOnce())
    mocks.heldAccountId = 'account-b'
    finish?.({ scheduledDeletionAt: '2026-09-04T03:00:00Z' })
    expect(await screen.findByRole('alert')).toHaveTextContent('errors.api.accountChanged')
    expect(screen.queryByText(/successTitle/)).not.toBeInTheDocument()
    expect(mocks.clearTiming).not.toHaveBeenCalled()
  })

  it('does not grant API key creation after a different account arrives during confirmation', async () => {
    mocks.operation = 'keys'
    let finish: ((value: { message: string }) => void) | undefined
    mocks.serverAuthMutate.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
    await renderLiveScreen({ operation: 'keys', sentAt: Date.now() })
    enterCode()
    clickConfirm()
    await waitFor(() => expect(mocks.serverAuthMutate).toHaveBeenCalledOnce())
    mocks.heldAccountId = 'account-b'
    finish?.({ message: 'Challenge confirmed' })
    expect(await screen.findByRole('alert')).toHaveTextContent('errors.api.accountChanged')
    expect(mocks.markVerified).not.toHaveBeenCalled()
    expect(mocks.replace).not.toHaveBeenCalled()
  })

  it('does not restart a challenge after a different account arrives during resend', async () => {
    let finish: ((value: { message: string }) => void) | undefined
    mocks.serverAuthMutate.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
    await renderLiveScreen(liveRecord(60_000))
    fireEvent.click(screen.getByText('resend'))
    await waitFor(() => expect(mocks.serverAuthMutate).toHaveBeenCalledOnce())
    mocks.heldAccountId = 'account-b'
    finish?.({ message: 'Challenge sent' })
    expect(await screen.findByRole('alert')).toHaveTextContent('errors.api.accountChanged')
    expect(mocks.beginChallenge).not.toHaveBeenCalled()
  })

  it('requests a new API key challenge under the held account', async () => {
    mocks.operation = 'keys'
    await renderLiveScreen({ operation: 'keys', sentAt: Date.now() - 60_000 })
    fireEvent.click(screen.getByText('resend'))
    await waitFor(() => expect(mocks.serverAuthMutate).toHaveBeenCalledWith(
      API.apiKeys.requestCreationChallenge, { method: 'POST' }, 'account-a',
    ))
    expect(mocks.beginChallenge).toHaveBeenCalledWith('keys', 'account-a')
  })

  it('keeps the old challenge when resending fails with an account refusal', async () => {
    mocks.serverAuthMutate.mockRejectedValueOnce({ status: 409, code: 'ACCOUNT_CHANGED' })
    await renderLiveScreen(liveRecord(60_000))
    fireEvent.click(screen.getByText('resend'))
    expect(await screen.findByRole('alert')).toHaveTextContent('errors.api.accountChanged')
    expect(mocks.beginChallenge).not.toHaveBeenCalled()
  })

  it('shows a cooldown on arrival and a ghost resend only after it is ready', async () => {
    await renderLiveScreen()
    expect(screen.getByText(/cooldown/)).toBeInTheDocument()
    expect(screen.queryByText('resend')).not.toBeInTheDocument()

    mocks.readTiming.mockReturnValue(liveRecord(60_000))
    render(<StepUpScreen serverAccountId={null} />)
    expect((await screen.findByText('resend')).closest('button')).toHaveAttribute('data-variant', 'ghost')
  })

  it('restarts and hides the cooldown when a new challenge is sent', async () => {
    await renderLiveScreen(liveRecord(60_000))
    fireEvent.click(screen.getByText('resend'))

    await waitFor(() => expect(mocks.serverAuthMutate).toHaveBeenCalledWith(
      API.auth.requestDeletion,
      { method: 'POST' },
      'account-a',
    ))
    expect(mocks.beginChallenge).toHaveBeenCalledWith('delete', 'account-a')
    expect(screen.getByText(/cooldown/)).toBeInTheDocument()
    expect(screen.queryByText('resend')).not.toBeInTheDocument()
  })

  const progressName = () => screen.getByRole('list', { name: /^habits\.flow\.progress/ }).getAttribute('aria-label')

  it('asks the code in the guided centred question layout with the flag on: the back arrow, the progress of the delete flow, one question and no eyebrow', async () => {
    await renderLiveScreen()
    const flow = document.querySelector('[data-guided-step-up] [data-question-flow]')
    expect(flow).not.toBeNull()
    expect(flow).toHaveAttribute('data-step', 'code')
    expect(screen.getAllByRole('heading')).toHaveLength(1)
    expect(screen.getByRole('heading', { level: 1 })).toHaveAccessibleDescription('body:{"email":"person@example.com"}')
    expect(screen.queryByText(/^eyebrow/)).not.toBeInTheDocument()
    expect(progressName()).toBe('habits.flow.progress:{"position":3,"total":3}')
    expect(document.querySelector('[data-flow-primary] button')).toHaveTextContent('confirm')
    expect(screen.getByText('neverShare')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'common.back' }))
    expect(mocks.router.replace).toHaveBeenCalledWith('/profile/account')
  })

  it('counts the code of an API key as its own one-step progress with the flag on', async () => {
    mocks.operation = 'keys'
    await renderLiveScreen({ operation: 'keys', sentAt: Date.now() })
    expect(progressName()).toBe('habits.flow.progress:{"position":1,"total":1}')
    expect(document.querySelector('[data-question-flow]')).toHaveAttribute('data-step', 'code')
  })

  it('shows the expired, exhausted and closed states in the same guided frame with the flag on', async () => {
    await renderLiveScreen(liveRecord(STEP_UP_CHALLENGE_DURATION_MS + 1000))
    expect(document.querySelector('[data-question-flow]')).toHaveAttribute('data-step', 'expired')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('expiredTitle')
    expect(document.querySelector('[data-flow-primary] button')).toHaveTextContent('resend')
    cleanup()
    mocks.readTiming.mockReturnValue({ ...liveRecord(), exhaustedAt: Date.now() })
    render(<StepUpScreen serverAccountId={null} />)
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('exhaustedTitle')
    expect(document.querySelector('[data-question-flow]')).toHaveAttribute('data-step', 'exhausted')
    expect(document.querySelector('[data-flow-primary]')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /back/i }))
    expect(mocks.router.replace).toHaveBeenCalledWith('/profile/account')
  })

  it('holds no mascot on the exhausted step with the flag on', async () => {
    mocks.readTiming.mockReturnValue({ ...liveRecord(), exhaustedAt: Date.now() })
    render(<StepUpScreen serverAccountId={null} />)
    expect(await screen.findByText('exhaustedTitle')).toBeInTheDocument()
    expect(document.querySelector('[data-orbit-state]')).toBeNull()
  })

  it.each([false, true])('closes the delete flow with the result dialog: Orbit in Parado, the date the server set, and sign out (Pro %s)', async (pro) => {
    mocks.profile.hasProAccess = pro
    await renderLiveScreen()
    enterCode()
    clickConfirm()

    const dialog = await screen.findByRole('dialog', { name: 'result.title' })
    expect(mocks.flowCompleted).toHaveBeenCalledExactlyOnceWith('delete_account', 3, false)
    const sentence = `result.account.${pro ? 'deletionScheduledPro' : 'deletionScheduled'}:{"date":"local:2026-09-04T03:00:00Z"}`
    expect(dialog).toHaveAccessibleDescription(sentence)
    expect(dialog.querySelector('[data-result-dialog]')).toHaveAttribute('data-orbit-state', 'parado')
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'stepUp.signOut' })).toHaveFocus())
    fireEvent.click(within(dialog).getByRole('button', { name: 'stepUp.signOut' }))
    expect(mocks.logout).toHaveBeenCalledOnce()

    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(document.querySelector('[data-question-flow]')).toHaveAttribute('data-step', 'done')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('successTitle:{"date":"numeric:2026-09-04T03:00:00Z"}')
    if (pro) expect(screen.getByText(/successPro/)).toHaveTextContent('local:2026-09-04T03:00:00Z')
    fireEvent.click(screen.getByText('signOut'))
    expect(mocks.logout).toHaveBeenCalledTimes(2)
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

  it('confirms API key creation in the guided frame and returns to the creation handoff, and never reports the verified code as a left flow', async () => {
    mocks.operation = 'keys'
    mocks.readTiming.mockReturnValue({ operation: 'keys', sentAt: Date.now() })
    const { unmount } = render(<StepUpScreen serverAccountId={null} />)
    expect(document.querySelector('[data-guided-step-up] [data-question-flow]')).toHaveAttribute('data-step', 'code')
    await screen.findByLabelText('codeLabel')
    enterCode()
    clickConfirm()

    await waitFor(() => expect(mocks.serverAuthMutate).toHaveBeenCalledWith(
      API.apiKeys.confirmCreationChallenge,
      { method: 'POST', body: JSON.stringify({ code: '123456' }) },
      'account-a',
    ))
    expect(mocks.clearTiming).toHaveBeenCalledWith('keys', 'account-a')
    expect(mocks.markVerified).toHaveBeenCalledWith('keys')
    expect(mocks.replace).toHaveBeenCalledWith('/profile/ai')
    unmount()
    const events = vi.mocked(captureGuidedFlowEvent).mock.calls.map(([event]) => event)
    expect(events).toContainEqual({ name: 'guided_flow_step_viewed', properties: { flow: 'api_key_create', step: 'code', step_count: 1 } })
    expect(events.filter((event) => event.name === 'guided_flow_abandoned')).toEqual([])
  })
})

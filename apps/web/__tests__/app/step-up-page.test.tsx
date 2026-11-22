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

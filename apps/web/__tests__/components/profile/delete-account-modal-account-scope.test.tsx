import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { getStepUpPhaseFromTiming, getStepUpStorageKey } from '@orbit/shared/utils'
import { holdAccount, replaceAccountWith, retireHeldAccount } from '@/__tests__/support/account-change'
import { useAuthStore } from '@/stores/auth-store'
import { sheetTestControls } from '@/__tests__/support/sheet-double'

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  requestDeletion: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push }),
}))
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'en',
}))
vi.mock('@/lib/actions/auth', () => ({
  requestDeletion: () => mocks.requestDeletion(),
}))
vi.mock('@/components/ui/sheet', async () => await import('@/__tests__/support/sheet-double'))

import { DeleteAccountModal } from '@/app/(app)/profile/_components/delete-account-modal'
import {
  clearStepUpState,
  markStepUpExhausted,
  readStepUpTiming,
} from '@/lib/step-up-storage'

const profile = undefined

async function sendTheCode() {
  fireEvent.click(screen.getByText('profile.deleteAccount.sendCode'))
  await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/step-up?operation=delete'))
  mocks.push.mockClear()
}

/**
 * Spends the account's last attempt the way the step-up screen does, inside a live attempt window,
 * because an exhaustion older than that window is dropped on the next challenge and would let the
 * unscoped key pass.
 */
function burnTheAttempts(): number {
  const exhaustedAt = Date.now()
  markStepUpExhausted(readStepUpTiming('delete', 'user-1')!, 'user-1', exhaustedAt)
  return exhaustedAt
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
  sheetTestControls.defer(false)
  mocks.requestDeletion.mockResolvedValue(undefined)
  localStorage.clear()
  clearStepUpState()
  holdAccount('user-1')
})

afterEach(() => {
  cleanup()
  localStorage.clear()
  clearStepUpState()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

/** A new account must not inherit another account's exhausted attempt window. */
it('gives the next account a fresh challenge after the previous one burned its attempts', async () => {
  const { rerender } = render(
    <DeleteAccountModal open onOpenChange={vi.fn()} profile={profile} />,
  )
  await sendTheCode()
  const exhaustedAt = burnTheAttempts()
  expect(getStepUpPhaseFromTiming(readStepUpTiming('delete', 'user-1')!, exhaustedAt + 1))
    .toBe('exhausted')

  await replaceAccountWith('user-2')
  rerender(<DeleteAccountModal open onOpenChange={vi.fn()} profile={profile} />)
  await sendTheCode()

  const next = readStepUpTiming('delete', 'user-2')
  expect(next).not.toBeNull()
  expect(next!.exhaustedAt).toBeUndefined()
  expect(getStepUpPhaseFromTiming(next!, exhaustedAt + 1)).toBe('challenge')
})

it('leaves each account its own record and writes nothing to the unscoped key', async () => {
  render(<DeleteAccountModal open onOpenChange={vi.fn()} profile={profile} />)
  await sendTheCode()
  const exhaustedAt = burnTheAttempts()

  await replaceAccountWith('user-2')
  cleanup()
  render(<DeleteAccountModal open onOpenChange={vi.fn()} profile={profile} />)
  await sendTheCode()

  expect(readStepUpTiming('delete', 'user-1')!.exhaustedAt).toBe(exhaustedAt)
  expect(localStorage.getItem(getStepUpStorageKey('delete', 'user-1'))).not.toBeNull()
  expect(localStorage.getItem(getStepUpStorageKey('delete', 'user-2'))).not.toBeNull()
  expect(localStorage.getItem('orbit.step-up.delete')).toBeNull()
})

it('does not route the next account into a delayed deletion challenge', async () => {
  let releaseRequest!: () => void
  mocks.requestDeletion.mockImplementationOnce(() => new Promise<void>((resolve) => {
    releaseRequest = resolve
  }))
  render(<DeleteAccountModal open onOpenChange={vi.fn()} profile={profile} />)
  fireEvent.click(screen.getByText('profile.deleteAccount.sendCode'))

  await replaceAccountWith('user-2')
  await act(async () => { releaseRequest(); await Promise.resolve() })

  expect(mocks.push).not.toHaveBeenCalled()
  expect(readStepUpTiming('delete', 'user-1')).toBeNull()
})

it('waits for the first account check before requesting a deletion challenge', async () => {
  await retireHeldAccount()
  useAuthStore.setState({ isAuthenticated: true, sessionInactive: false })
  let finishSession!: (response: Response) => void
  vi.mocked(globalThis.fetch).mockImplementationOnce(() => new Promise((resolve) => {
    finishSession = resolve
  }))
  const firstCheck = useAuthStore.getState().checkSession()
  render(<DeleteAccountModal open onOpenChange={vi.fn()} profile={profile} />)

  const sendButton = screen.getByText('profile.deleteAccount.sendCode').closest('button')!
  expect(sendButton).toBeDisabled()
  fireEvent.click(sendButton)
  expect(mocks.requestDeletion).not.toHaveBeenCalled()

  await act(async () => {
    finishSession({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ expiresAt: Date.now() + 3600000, userId: 'user-1' }),
    } as Response)
    await firstCheck
  })
  await sendTheCode()
  expect(mocks.requestDeletion).toHaveBeenCalledTimes(1)
  expect(readStepUpTiming('delete', 'user-1')).not.toBeNull()
})

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

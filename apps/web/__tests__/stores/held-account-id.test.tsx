import React from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { useAuthStore, useHeldAccountId } from '@/stores/auth-store'
import { replaceAccountWith, respondWithAccount } from '@/__tests__/support/account-change'

function HeldAccount() {
  const accountId = useHeldAccountId()
  return <span data-testid="held">{accountId ?? 'none'}</span>
}

function heldAccount(): string {
  return screen.getByTestId('held').textContent
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

it('reports the account the first session check of a cold tab records', async () => {
  render(<HeldAccount />)
  expect(heldAccount()).toBe('none')

  respondWithAccount('user-1')
  await act(async () => {
    await useAuthStore.getState().checkSession()
  })

  expect(heldAccount()).toBe('user-1')
})

it('moves to the next account when one replaces the tab', async () => {
  render(<HeldAccount />)
  respondWithAccount('user-1')
  await act(async () => {
    await useAuthStore.getState().checkSession()
  })

  await replaceAccountWith('user-2')

  expect(heldAccount()).toBe('user-2')
})

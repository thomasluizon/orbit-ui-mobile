import React, { useEffect } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { setAccountId } from '@/lib/account-scope'
import { StoreBillingProvider } from '@/hooks/store-billing-provider'

const TestRenderer = require('react-test-renderer')
vi.mock('@/hooks/use-play-billing', () => ({ useStoreBillingConnection: () => ({}), selectStoreOffer: vi.fn() }))
afterEach(() => setAccountId(null))

it('retains the navigator while the account changes', () => {
  const mounted = vi.fn()
  function Navigator() { useEffect(() => { mounted() }, []); return null }
  setAccountId(null)
  let tree!: ReturnType<typeof TestRenderer.create>
  TestRenderer.act(() => { tree = TestRenderer.create(<StoreBillingProvider><Navigator /></StoreBillingProvider>) })
  TestRenderer.act(() => { setAccountId('account-1'); tree.update(<StoreBillingProvider><Navigator /></StoreBillingProvider>) })
  TestRenderer.act(() => { setAccountId('account-2'); tree.update(<StoreBillingProvider><Navigator /></StoreBillingProvider>) })
  expect(mounted).toHaveBeenCalledOnce()
  TestRenderer.act(() => tree.unmount())
})

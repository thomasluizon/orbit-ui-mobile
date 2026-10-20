'use client'

import { useLayoutEffect, type ReactNode } from 'react'
import { seedRenderedAccount } from '@/stores/auth-store'

export function RenderedAccountSeed({ accountId, children }: Readonly<{
  accountId: string | null
  children: ReactNode
}>) {
  useLayoutEffect(() => {
    if (accountId !== null) seedRenderedAccount(accountId)
  }, [accountId])

  return <>{children}</>
}

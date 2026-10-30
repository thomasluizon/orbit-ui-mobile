'use client'

import { createContext, useContext, useState, type ReactNode } from 'react'
import { useAccountGeneration } from '@/hooks/use-session-reset'

interface AccountClockSeed {
  now: number
  timeZone: string | null
}

const AccountClockContext = createContext<AccountClockSeed | null>(null)

export function AccountClock({ now, timeZone, children }: Readonly<AccountClockSeed & { children: ReactNode }>) {
  const accountGeneration = useAccountGeneration()
  const [seedAccountGeneration] = useState(accountGeneration)
  return <AccountClockContext.Provider value={accountGeneration === seedAccountGeneration ? { now, timeZone } : null}>
    {children}
  </AccountClockContext.Provider>
}

export function useAccountClockSeed() {
  return useContext(AccountClockContext)
}

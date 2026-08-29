'use client'

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

interface ShellScrollerContextValue {
  scroller: HTMLElement | null
  registerScroller: (owner: symbol, scroller: HTMLElement | null) => void
}

interface ShellScrollerRegistration {
  owner: symbol
  scroller: HTMLElement
}

const ShellScrollerContext = createContext<ShellScrollerContextValue | null>(null)

export function ShellScrollerProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [registrations, setRegistrations] = useState<ShellScrollerRegistration[]>([])
  const registerScroller = useCallback((owner: symbol, nextScroller: HTMLElement | null) => {
    setRegistrations((current) => {
      const remaining = current.filter((registration) => registration.owner !== owner)
      return nextScroller ? [...remaining, { owner, scroller: nextScroller }] : remaining
    })
  }, [])
  const scroller = registrations.at(-1)?.scroller ?? null
  const value = useMemo(
    () => ({ scroller, registerScroller }),
    [registerScroller, scroller],
  )

  return (
    <ShellScrollerContext.Provider value={value}>
      {children}
    </ShellScrollerContext.Provider>
  )
}

export function useShellScroller(): HTMLElement | null {
  return useContext(ShellScrollerContext)?.scroller ?? null
}

export function useShellScrollerRegistration(
  owner: symbol,
): ((scroller: HTMLElement | null) => void) | undefined {
  const context = useContext(ShellScrollerContext)
  const registerScroller = context?.registerScroller
  const registration = useCallback(
    (scroller: HTMLElement | null) => registerScroller?.(owner, scroller),
    [owner, registerScroller],
  )
  return context ? registration : undefined
}

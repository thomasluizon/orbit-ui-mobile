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
  registerScroller: (scroller: HTMLElement | null) => void
}

const ShellScrollerContext = createContext<ShellScrollerContextValue | null>(null)

export function ShellScrollerProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [scroller, setScroller] = useState<HTMLElement | null>(null)
  const registerScroller = useCallback((nextScroller: HTMLElement | null) => {
    setScroller(nextScroller)
  }, [])
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

export function useShellScrollerRegistration(): ((scroller: HTMLElement | null) => void) | undefined {
  const context = useContext(ShellScrollerContext)
  return context?.registerScroller
}

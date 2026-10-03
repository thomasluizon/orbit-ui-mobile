import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

interface ShellScrollToTopSlotContextValue {
  register: (content: ReactNode) => () => void
}

const ShellScrollToTopSlotContext = createContext<ShellScrollToTopSlotContextValue | null>(null)

export function useShellScrollToTopHost() {
  const [content, setContent] = useState<ReactNode>(undefined)
  const register = useCallback((nextContent: ReactNode) => {
    setContent(nextContent)
    return () => setContent((current) => current === nextContent ? undefined : current)
  }, [])
  const value = useMemo(() => ({ register }), [register])
  return { value, content }
}

export function ShellScrollToTopSlotProvider({ value, children }: Readonly<{ value: ShellScrollToTopSlotContextValue; children: ReactNode }>) {
  return <ShellScrollToTopSlotContext.Provider value={value}>{children}</ShellScrollToTopSlotContext.Provider>
}

export function useShellScrollToTopSlot(enabled: boolean, content: ReactNode) {
  const host = useContext(ShellScrollToTopSlotContext)
  useEffect(() => {
    if (enabled) return host?.register(content)
  }, [content, enabled, host])
}

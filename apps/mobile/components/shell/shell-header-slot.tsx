import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

interface ShellHeaderSlotContextValue {
  register: (content: ReactNode) => () => void
}

const ShellHeaderSlotContext = createContext<ShellHeaderSlotContextValue | null>(null)

export function useShellHeaderHost() {
  const [content, setContent] = useState<ReactNode>(undefined)
  const register = useCallback((nextContent: ReactNode) => {
    setContent(nextContent)
    return () => setContent((current) => current === nextContent ? undefined : current)
  }, [])
  const value = useMemo(() => ({ register }), [register])
  return { value, content }
}

export function ShellHeaderSlotProvider({ value, children }: Readonly<{ value: ShellHeaderSlotContextValue; children: ReactNode }>) {
  return <ShellHeaderSlotContext.Provider value={value}>{children}</ShellHeaderSlotContext.Provider>
}

export function useShellHeaderSlot(enabled: boolean, content: ReactNode) {
  const host = useContext(ShellHeaderSlotContext)
  useEffect(() => {
    if (enabled) return host?.register(content)
  }, [content, enabled, host])
  return host !== null
}

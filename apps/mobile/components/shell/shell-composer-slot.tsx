import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

interface ShellComposerSlotContextValue {
  register: (content: ReactNode) => () => void
}

const ShellComposerSlotContext = createContext<ShellComposerSlotContextValue | null>(null)

export function useShellComposerHost() {
  const [content, setContent] = useState<ReactNode>(null)
  const register = useCallback((nextContent: ReactNode) => {
    setContent(nextContent)
    return () => setContent((current) => current === nextContent ? null : current)
  }, [])
  const value = useMemo(() => ({ register }), [register])
  return { value, content }
}

export function ShellComposerSlotProvider({ value, children }: Readonly<{ value: ShellComposerSlotContextValue; children: ReactNode }>) {
  return <ShellComposerSlotContext.Provider value={value}>{children}</ShellComposerSlotContext.Provider>
}

/** Registers destination-owned controls in Shell412's pinned composer slot. */
export function useShellComposerSlot(enabled: boolean, content: ReactNode) {
  const host = useContext(ShellComposerSlotContext)

  useEffect(() => {
    if (!enabled) return
    return host?.register(content)
  }, [content, enabled, host])
}

import { createContext, useCallback, useContext, useEffect, useEffectEvent, useMemo, useState, type ReactNode } from 'react'

interface ShellComposerSlotContextValue {
  register: (content: ReactNode) => () => void
}

const ShellComposerSlotContext = createContext<ShellComposerSlotContextValue | null>(null)
const ShellNoticeSlotContext = createContext<ShellComposerSlotContextValue | null>(null)

export function useShellSlotHost() {
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

export function ShellNoticeSlotProvider({ value, children }: Readonly<{ value: ShellComposerSlotContextValue; children: ReactNode }>) {
  return <ShellNoticeSlotContext.Provider value={value}>{children}</ShellNoticeSlotContext.Provider>
}

/** Registers destination-owned controls in Shell412's pinned composer slot. */
export function useShellComposerSlot(enabled: boolean, content: ReactNode) {
  const host = useContext(ShellComposerSlotContext)

  useEffect(() => {
    if (!enabled) return
    return host?.register(content)
  }, [content, enabled, host])
}

/** Registers transient feedback in Shell412's notice slot above pinned controls. */
export function useShellNoticeSlot(
  enabled: boolean,
  content: ReactNode,
  refreshKey: string,
) {
  const host = useContext(ShellNoticeSlotContext)
  const registerContent = useEffectEvent(() => host?.register(content))

  useEffect(() => {
    if (!enabled) return
    return registerContent()
  }, [enabled, host, refreshKey])
}

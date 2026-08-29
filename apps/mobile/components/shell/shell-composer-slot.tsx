import { createContext, useCallback, useContext, useEffect, useEffectEvent, useMemo, useState, type ReactNode } from 'react'

type ComposerRenderer = () => ReactNode

interface ShellComposerSlotContextValue {
  register: (renderer: ComposerRenderer) => () => void
}

const ShellComposerSlotContext = createContext<ShellComposerSlotContextValue | null>(null)

export function useShellComposerHost() {
  const [renderer, setRenderer] = useState<ComposerRenderer | null>(null)
  const register = useCallback((nextRenderer: ComposerRenderer) => {
    setRenderer(() => nextRenderer)
    return () => setRenderer((current) => current === nextRenderer ? null : current)
  }, [])
  const value = useMemo(() => ({ register }), [register])
  return { value, content: renderer?.() }
}

export function ShellComposerSlotProvider({ value, children }: Readonly<{ value: ShellComposerSlotContextValue; children: ReactNode }>) {
  return <ShellComposerSlotContext.Provider value={value}>{children}</ShellComposerSlotContext.Provider>
}

/** Registers destination-owned controls in Shell412's pinned composer slot. */
export function useShellComposerSlot(enabled: boolean, renderer: ComposerRenderer, refreshKey: string) {
  const host = useContext(ShellComposerSlotContext)
  const registerRenderer = useEffectEvent(() => host?.register(renderer))

  useEffect(() => {
    if (!enabled) return
    return registerRenderer()
  }, [enabled, host, refreshKey])
}

'use client'

import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useEffectEvent,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react'

type NoticeRenderer = () => ReactNode

interface ShellNoticeSlotContextValue {
  register: (renderer: NoticeRenderer) => () => void
}

const ShellNoticeSlotContext = createContext<ShellNoticeSlotContextValue | null>(null)

interface ShellNoticeHost {
  value: ShellNoticeSlotContextValue
  content: ReactNode
}

export function useShellNoticeHost(): ShellNoticeHost {
  const [renderer, setRenderer] = useState<NoticeRenderer | null>(null)
  const register = useCallback((nextRenderer: NoticeRenderer) => {
    setRenderer(() => nextRenderer)
    return () => setRenderer((current) =>
      current === nextRenderer ? null : current,
    )
  }, [])
  const value = useMemo(() => ({ register }), [register])
  return { value, content: renderer?.() }
}

export function ShellNoticeSlotProvider({
  value,
  children,
}: Readonly<{ value: ShellNoticeSlotContextValue; children: ReactNode }>): ReactElement {
  return createElement(ShellNoticeSlotContext.Provider, { value }, children)
}

/** Registers destination-owned feedback in the shell slot above the composer. */
export function useShellNoticeSlot(
  enabled: boolean,
  renderer: NoticeRenderer,
  refreshKey: string,
): void {
  const host = useContext(ShellNoticeSlotContext)
  const registerRenderer = useEffectEvent(() => host?.register(renderer))

  useEffect(() => {
    if (!enabled) return
    return registerRenderer()
  }, [enabled, host, refreshKey])
}

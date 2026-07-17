'use client'

import {
  createContext,
  use,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

interface TopbarSlotContextValue {
  node: ReactNode
  setSlot: (ownerId: string, node: ReactNode) => void
  clearSlot: (ownerId: string) => void
}

const TopbarSlotContext = createContext<TopbarSlotContextValue | null>(null)

/**
 * Lets a page contribute the left content of the desktop topbar (e.g. Today's
 * date navigation) while the shell owns the bar's layout and the right cluster.
 * The page keeps its own state; only the rendered node crosses the seam. Each
 * contributor is tracked by an owner id so a late-unmounting page (route
 * transitions keep the outgoing page mounted through its exit animation) only
 * clears the slot while it still owns it, never the incoming page's node.
 */
export function TopbarSlotProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [state, setState] = useState<{ node: ReactNode; ownerId: string | null }>({
    node: null,
    ownerId: null,
  })

  const setSlot = useCallback((ownerId: string, node: ReactNode) => {
    setState({ node, ownerId })
  }, [])

  const clearSlot = useCallback((ownerId: string) => {
    setState((previous) => (previous.ownerId === ownerId ? { node: null, ownerId: null } : previous))
  }, [])

  const value = useMemo(
    () => ({ node: state.node, setSlot, clearSlot }),
    [state.node, setSlot, clearSlot],
  )

  return <TopbarSlotContext.Provider value={value}>{children}</TopbarSlotContext.Provider>
}

/** Reads the current topbar-left node. Used by the shell to render it. */
export function useTopbarSlotNode(): ReactNode {
  return use(TopbarSlotContext)?.node ?? null
}

/**
 * Registers `node` as the desktop topbar's left content for as long as the
 * calling component is mounted, clearing it on unmount only if this contributor
 * still owns the slot. Safe outside a provider (renders nothing extra). Pass
 * `null` to contribute nothing.
 */
export function useTopbarSlot(node: ReactNode): void {
  const ctx = use(TopbarSlotContext)
  const setSlot = ctx?.setSlot
  const clearSlot = ctx?.clearSlot
  const ownerId = useId()

  useEffect(() => {
    if (!setSlot || !clearSlot) return
    setSlot(ownerId, node)
    return () => clearSlot(ownerId)
    // react-doctor-disable-next-line exhaustive-deps -- setSlot/clearSlot alias ctx.setSlot/ctx.clearSlot and are already in deps; react-doctor does not resolve the alias; https://github.com/thomasluizon/orbit-ui-mobile/issues/243
  }, [setSlot, clearSlot, ownerId, node])
}

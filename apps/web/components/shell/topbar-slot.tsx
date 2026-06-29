'use client'

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'

interface TopbarSlotContextValue {
  node: ReactNode
  setNode: (node: ReactNode) => void
}

const TopbarSlotContext = createContext<TopbarSlotContextValue | null>(null)

/**
 * Lets a page contribute the left content of the desktop topbar (e.g. Today's
 * date navigation) while the shell owns the bar's layout and the right cluster.
 * The page keeps its own state; only the rendered node crosses the seam.
 */
export function TopbarSlotProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [node, setNode] = useState<ReactNode>(null)
  return (
    <TopbarSlotContext.Provider value={{ node, setNode }}>
      {children}
    </TopbarSlotContext.Provider>
  )
}

/** Reads the current topbar-left node. Used by the shell to render it. */
export function useTopbarSlotNode(): ReactNode {
  return useContext(TopbarSlotContext)?.node ?? null
}

/**
 * Registers `node` as the desktop topbar's left content for as long as the
 * calling component is mounted, clearing it on unmount. Safe outside a provider
 * (renders nothing extra). Pass `null` to contribute nothing.
 */
export function useTopbarSlot(node: ReactNode): void {
  const ctx = useContext(TopbarSlotContext)
  const setNode = ctx?.setNode

  useEffect(() => {
    if (!setNode) return
    setNode(node)
    return () => setNode(null)
  }, [setNode, node])
}

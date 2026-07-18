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

/** A page's claim on the desktop page title. */
export interface TopbarHeadingClaim {
  /** Overrides the route-derived title text. */
  title?: string
  /** The page renders the page title inside its own content, so the shell renders none. */
  ownedByPage?: boolean
}

interface ResolvedHeadingClaim {
  title: string | null
  ownedByPage: boolean
}

const NO_CLAIM: ResolvedHeadingClaim = { title: null, ownedByPage: false }

interface TopbarSlotContextValue {
  node: ReactNode
  heading: ResolvedHeadingClaim
  setSlot: (ownerId: string, node: ReactNode) => void
  clearSlot: (ownerId: string) => void
  setHeading: (ownerId: string, claim: ResolvedHeadingClaim) => void
  clearHeading: (ownerId: string) => void
}

const TopbarSlotContext = createContext<TopbarSlotContextValue | null>(null)

/**
 * Owns the desktop topbar's left region, which has exactly two channels so that
 * "the page title" has a single owner: the shell renders the one `<h1>`, and a
 * page contributes either accessory controls (`useTopbarSlot` — Today's date
 * navigation, Insights' range selector, Challenges' actions) or a title claim
 * (`useTopbarHeading` — override the text, or declare that the page's own
 * content carries the heading). Each contributor is tracked by an owner id so a
 * late-unmounting page (route transitions keep the outgoing page mounted through
 * its exit animation) only clears a channel while it still owns it, never the
 * incoming page's.
 */
export function TopbarSlotProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [slotState, setSlotState] = useState<{ node: ReactNode; ownerId: string | null }>({
    node: null,
    ownerId: null,
  })
  const [headingState, setHeadingState] = useState<{
    claim: ResolvedHeadingClaim
    ownerId: string | null
  }>({ claim: NO_CLAIM, ownerId: null })

  const setSlot = useCallback((ownerId: string, node: ReactNode) => {
    setSlotState({ node, ownerId })
  }, [])

  const clearSlot = useCallback((ownerId: string) => {
    setSlotState((previous) =>
      previous.ownerId === ownerId ? { node: null, ownerId: null } : previous,
    )
  }, [])

  const setHeading = useCallback((ownerId: string, claim: ResolvedHeadingClaim) => {
    setHeadingState({ claim, ownerId })
  }, [])

  const clearHeading = useCallback((ownerId: string) => {
    setHeadingState((previous) =>
      previous.ownerId === ownerId ? { claim: NO_CLAIM, ownerId: null } : previous,
    )
  }, [])

  const value = useMemo(
    () => ({
      node: slotState.node,
      heading: headingState.claim,
      setSlot,
      clearSlot,
      setHeading,
      clearHeading,
    }),
    [slotState.node, headingState.claim, setSlot, clearSlot, setHeading, clearHeading],
  )

  return <TopbarSlotContext.Provider value={value}>{children}</TopbarSlotContext.Provider>
}

/** Reads the current topbar accessory node. Used by the shell to render it. */
export function useTopbarSlotNode(): ReactNode {
  return use(TopbarSlotContext)?.node ?? null
}

/** Reads the current page's title claim. Used by the shell to resolve its `<h1>`. */
export function useTopbarHeadingClaim(): ResolvedHeadingClaim {
  return use(TopbarSlotContext)?.heading ?? NO_CLAIM
}

/**
 * Registers `node` as the desktop topbar's accessory controls for as long as the
 * calling component is mounted, clearing it on unmount only if this contributor
 * still owns the slot. Accessories render beside the shell's title, never instead
 * of it — a page that needs different title TEXT calls `useTopbarHeading`. Safe
 * outside a provider (renders nothing extra). Pass `null` to contribute nothing.
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

/**
 * Declares how the calling page relates to the desktop page title: pass `title`
 * to override the route-derived text, or `ownedByPage` when the page's own
 * content already renders the page heading (so the shell renders none and the
 * document keeps exactly one `<h1>`). Safe outside a provider.
 */
export function useTopbarHeading({ title, ownedByPage = false }: Readonly<TopbarHeadingClaim>): void {
  const ctx = use(TopbarSlotContext)
  const setHeading = ctx?.setHeading
  const clearHeading = ctx?.clearHeading
  const ownerId = useId()

  useEffect(() => {
    if (!setHeading || !clearHeading) return
    setHeading(ownerId, { title: title ?? null, ownedByPage })
    return () => clearHeading(ownerId)
    // react-doctor-disable-next-line exhaustive-deps -- setHeading/clearHeading alias ctx.setHeading/ctx.clearHeading and are already in deps; react-doctor does not resolve the alias; https://github.com/thomasluizon/orbit-ui-mobile/issues/243
  }, [setHeading, clearHeading, ownerId, title, ownedByPage])
}

import { createContext, useCallback, useContext, useEffect, useState, type MutableRefObject } from 'react'
import { Platform } from 'react-native'
import { MODAL_TRANSITION_FALLBACK_MS } from '@/components/ui/native-window-host'

/** The close action of the result dialog that draws in the window. The window sends the Android back press there. */
export type FlowWindowResultClose = MutableRefObject<(() => void) | null>

const FlowWindowContext = createContext<FlowWindowResultClose | null>(null)

/** Provided by a flow that presents in its own native window. A result dialog inside it draws in that window. */
export const FlowWindowProvider = FlowWindowContext.Provider

/**
 * The window of the flow around the caller, or `null` when the caller has none. On iOS a second `Modal` presents from
 * the root controller, which is already presenting the flow's `Modal`, so UIKit refuses it and reports no completion.
 * A dialog inside the flow's window has no second presentation to refuse.
 */
export function useFlowWindow(): FlowWindowResultClose | null {
  return useContext(FlowWindowContext)
}

/**
 * Hands one native window over to the next. While `leaving` is true the caller keeps its flow mounted with `open` false and
 * waits for `settle`, which `FlowScreen` calls once UIKit finished the dismissal. Only then may the next window present.
 * UIKit reports nothing for a transition it refuses, so a fallback releases the hold. Android presents at once.
 */
export function useWindowHandoff(leaving: boolean): { handedOver: boolean; settle: () => void } {
  const holds = Platform.OS === 'ios'
  const [dismissed, setDismissed] = useState(false)
  if (!leaving && dismissed) setDismissed(false)
  useEffect(() => {
    if (!leaving || !holds) return undefined
    const fallback = setTimeout(() => setDismissed(true), MODAL_TRANSITION_FALLBACK_MS)
    return () => clearTimeout(fallback)
  }, [leaving, holds])
  const settle = useCallback(() => setDismissed(true), [])
  return { handedOver: !leaving || !holds || dismissed, settle }
}

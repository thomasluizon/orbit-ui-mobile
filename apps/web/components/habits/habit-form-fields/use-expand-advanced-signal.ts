'use client'

import { useState } from 'react'

/**
 * Render-phase sync (adjusting-state-during-render pattern): opens the advanced
 * section whenever the parent bumps `expandAdvancedSignal` to a positive value
 * (used to reveal AI-applied checklist / sub-habits).
 */
export function useExpandAdvancedSignal(
  expandAdvancedSignal: number,
  onExpand: () => void,
): void {
  const [previousSignal, setPreviousSignal] = useState(expandAdvancedSignal)
  if (expandAdvancedSignal !== previousSignal) {
    setPreviousSignal(expandAdvancedSignal)
    // react-doctor-disable-next-line no-prop-callback-in-render -- deliberate adjusting-state-during-render sync (React "storing information from previous renders" pattern): gated by the previousSignal comparison so onExpand fires exactly once per signal bump https://github.com/thomasluizon/orbit-ui-mobile/issues/243
    if (expandAdvancedSignal > 0) onExpand()
  }
}

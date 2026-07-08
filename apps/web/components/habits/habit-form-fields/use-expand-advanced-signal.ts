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
    if (expandAdvancedSignal > 0) onExpand()
  }
}

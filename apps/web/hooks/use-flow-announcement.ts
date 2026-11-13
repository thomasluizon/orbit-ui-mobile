'use client'

import { useEffect, useRef, useState } from 'react'

const TYPING_PAUSE_MS = 1000

/**
 * The text of the one polite status region of a flow. A line that changes inside a step is announced
 * after a one second pause. A step change announces nothing, because the question describes itself
 * with the line.
 */
export function useFlowAnnouncement(line: string | null | undefined, stepKey: string): string {
  const [announced, setAnnounced] = useState('')
  const previousStep = useRef(stepKey)
  useEffect(() => {
    if (previousStep.current !== stepKey) {
      previousStep.current = stepKey
      setAnnounced('')
      return undefined
    }
    if (!line) return undefined
    const timer = setTimeout(() => setAnnounced(line), TYPING_PAUSE_MS)
    return () => clearTimeout(timer)
  }, [line, stepKey])
  return announced
}

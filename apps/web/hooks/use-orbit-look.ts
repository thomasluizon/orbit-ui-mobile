'use client'

import { useCallback, useRef, useState } from 'react'
import { orbitLookVector, type OrbitLookTarget } from '@orbit/shared/contracts/brand'

/** Orbit looks at the control in focus: a field with focus, or an option under the pointer or keyboard. */
export function useOrbitLook() {
  const mascotRef = useRef<HTMLSpanElement>(null)
  const [lookAt, setLookAt] = useState<OrbitLookTarget | null>(null)
  const lookTowards = useCallback((target: EventTarget | null) => {
    const mascot = mascotRef.current
    if (!mascot || !(target instanceof HTMLElement)) return
    const from = mascot.getBoundingClientRect()
    const to = target.getBoundingClientRect()
    setLookAt(orbitLookVector({ x: from.left + from.width / 2, y: from.top + from.height / 2 }, { x: to.left + to.width / 2, y: to.top + to.height / 2 }))
  }, [])
  const lookAway = useCallback(() => setLookAt(null), [])
  return { mascotRef, lookAt, lookTowards, lookAway }
}

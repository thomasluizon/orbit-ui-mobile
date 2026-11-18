'use client'

import type { ReactNode } from 'react'
import { motion } from 'motion/react'
import { motionDurations, motionEasings } from '@orbit/shared/theme'
import { useViewportMatch } from '@/hooks/use-viewport-match'

const HOP_HEIGHT = 12

/** The one hop of Orbit, for the result dialog and the four celebration triggers. It plays once when `active` turns true, and reduced motion keeps Orbit still. */
export function OrbitHop({ active, className, children }: Readonly<{ active: boolean; className?: string; children: ReactNode }>) {
  const reducedMotion = useViewportMatch('(prefers-reduced-motion: reduce)')
  const hop = active && !reducedMotion
  return (
    <motion.span aria-hidden="true" data-orbit-hop={hop ? 'play' : 'still'} className={className}
      animate={hop ? { y: [0, -HOP_HEIGHT, 0] } : { y: 0 }}
      transition={{ duration: motionDurations.slow / 1000, ease: [...motionEasings.standard] as [number, number, number, number] }}>
      {children}
    </motion.span>
  )
}

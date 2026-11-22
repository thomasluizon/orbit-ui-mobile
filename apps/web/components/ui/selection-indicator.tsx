'use client'

import { motion } from 'motion/react'
import { motionSprings } from '@orbit/shared/theme'
import { useViewportMatch } from '@/hooks/use-viewport-match'

/** The calendar ring is a stylesheet rule, not an inline style: motion rewrites an inline box-shadow during a shared layout flight, and its correction turns a var() ring into an invalid value. */
export function SelectionIndicator({ id, calendar = false }: Readonly<{ id: string; calendar?: boolean }>) {
  const reduced = useViewportMatch('(prefers-reduced-motion: reduce)')
  return <motion.span aria-hidden="true" data-selection-motion="" data-selection-ring={calendar ? '' : undefined} layoutId={reduced ? undefined : id}
    className="pointer-events-none absolute inset-0 rounded-[inherit]"
    style={{ zIndex: -1, backgroundColor: calendar ? 'transparent' : 'var(--bg-hover)' }}
    transition={reduced ? { duration: 0 } : { type: 'spring', ...motionSprings.snappy }} />
}

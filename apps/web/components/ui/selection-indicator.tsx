'use client'

import { motion } from 'motion/react'
import { motionSprings } from '@orbit/shared/theme'
import { useViewportMatch } from '@/hooks/use-viewport-match'

export function SelectionIndicator({ id, calendar = false }: Readonly<{ id: string; calendar?: boolean }>) {
  const reduced = useViewportMatch('(prefers-reduced-motion: reduce)')
  return <motion.span aria-hidden="true" data-selection-motion="" layoutId={reduced ? undefined : id}
    className="pointer-events-none absolute inset-0 rounded-[inherit]"
    style={{ zIndex: -1, backgroundColor: calendar ? 'var(--selection-bg)' : 'var(--bg-hover)', boxShadow: calendar ? 'inset 0 0 0 2px var(--primary)' : undefined }}
    transition={reduced ? { duration: 0 } : { type: 'spring', ...motionSprings.snappy }} />
}

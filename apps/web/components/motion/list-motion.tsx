'use client'

import { useEffect, useState, type Ref, type ReactNode, type CSSProperties } from 'react'
import { AnimatePresence, motion, usePresence } from 'motion/react'
import { motionDurations, motionEasings, motionSprings, resolveMotionPreset } from '@orbit/shared/theme'
import { useViewportMatch } from '@/hooks/use-viewport-match'

export function ListPresence({ children }: Readonly<{ children: ReactNode }>) {
  return <AnimatePresence initial={false} mode="popLayout">{children}</AnimatePresence>
}

function useExitDeadline(duration: number) {
  const [present, remove] = usePresence()
  useEffect(() => {
    if (present) return
    const timer = setTimeout(() => remove(), duration)
    return () => clearTimeout(timer)
  }, [duration, present, remove])
  return present
}

export function ListMotionItem({ children, className, style, ref }: Readonly<{
  ref?: Ref<HTMLDivElement>
  children: ReactNode
  className?: string
  style?: CSSProperties
}>) {
  const reduced = useViewportMatch('(prefers-reduced-motion: reduce)')
  const enter = resolveMotionPreset('list-enter', reduced)
  const exit = resolveMotionPreset('list-exit', reduced)
  const present = useExitDeadline(reduced ? 0 : exit.exitDuration)
  return <motion.div ref={ref} layout={reduced ? false : 'position'}
    data-list-motion="" className={className} style={style} inert={!present} aria-hidden={!present || undefined}
    initial={{ opacity: 0, y: enter.shift }} animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: exit.shift, transition: { duration: reduced ? 0 : exit.exitDuration / 1000, ease: exit.exitEasing } }}
    transition={{ duration: reduced ? 0 : enter.enterDuration / 1000, ease: enter.enterEasing,
      layout: reduced ? { duration: 0 } : { type: 'spring', ...motionSprings.soft } }}>
    {children}
  </motion.div>
}

export function MotionDisclosure({ expanded, id, children }: Readonly<{ expanded: boolean; id?: string; children: ReactNode }>) {
  const reduced = useViewportMatch('(prefers-reduced-motion: reduce)')
  const [visible, setVisible] = useState(expanded)
  if (expanded && !visible) setVisible(true)
  return <div id={id} hidden={!expanded && (!visible || reduced)} inert={!expanded} aria-hidden={!expanded || undefined} data-motion-disclosure="" className="habit-row-group overflow-hidden">
    <AnimatePresence initial={false} onExitComplete={() => setVisible(false)}>
      {expanded ? <DisclosureBody key="children" duration={reduced ? 0 : motionDurations.base}>{children}</DisclosureBody> : null}
    </AnimatePresence>
  </div>
}

function DisclosureBody({ children, duration }: Readonly<{ children: ReactNode; duration: number }>) {
  useExitDeadline(duration)
  return <motion.div className="flex flex-col gap-2" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
    exit={{ height: 0, opacity: 0 }} transition={{ duration: duration / 1000, ease: motionEasings.standard }}>{children}</motion.div>
}

export function ContentFade({ children, ref }: Readonly<{ children: ReactNode; ref?: Ref<HTMLDivElement> }>) {
  const reduced = useViewportMatch('(prefers-reduced-motion: reduce)')
  useExitDeadline(reduced ? 0 : motionDurations.micro)
  return <motion.div ref={ref} className="relative content-fade" data-content-fade="" exit={{ opacity: 0 }} initial={false} animate={{ opacity: 1 }}
    transition={{ duration: reduced ? 0 : motionDurations.micro / 1000 }}>{children}</motion.div>
}

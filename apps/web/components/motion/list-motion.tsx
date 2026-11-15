'use client'

import { createContext, useContext, useEffect, useMemo, useRef, useState, type Ref, type ReactNode, type CSSProperties } from 'react'
import { animate, AnimatePresence, motion, PresenceContext, usePresence } from 'motion/react'
import { motionEasings, motionSprings, resolveMotionPreset } from '@orbit/shared/theme'
import { useViewportMatch } from '@/hooks/use-viewport-match'

export function ListPresence({ children }: Readonly<{ children: ReactNode }>) {
  return <AnimatePresence initial={false} mode="popLayout">{children}</AnimatePresence>
}

const softSpringResponseSeconds = 2 * Math.PI * Math.sqrt(motionSprings.soft.mass / motionSprings.soft.stiffness)

export const reorderTransition = {
  duration: Math.round(softSpringResponseSeconds * 1000),
  easing: `cubic-bezier(${motionEasings.enter.join(',')})`,
} as const

const ListScopeContext = createContext<{ scope: string; committedScope: { current: string }; bulk: boolean }>({ scope: '', committedScope: { current: '' }, bulk: false })

/** `bulk` is true while a bulk action changes the rows: a row then changes with no motion of its own, and `ListBulkSettle` plays the one motion of the group. */
export function ListScope({ scope, bulk = false, children }: Readonly<{ scope: string; bulk?: boolean; children: ReactNode }>) {
  const committedScope = useRef(scope)
  useEffect(() => { committedScope.current = scope }, [scope])
  const value = useMemo(() => ({ scope, committedScope, bulk }), [scope, bulk])
  return <ListScopeContext.Provider value={value}>{children}</ListScopeContext.Provider>
}

export function useListScope(): string {
  return useContext(ListScopeContext).scope
}

export function useListBulk(): boolean {
  return useContext(ListScopeContext).bulk
}

/** The one motion of a bulk action: the group settles from the `list-enter` scale once for each new generation. Reduced motion keeps the group still. */
export function ListBulkSettle({ generation, children }: Readonly<{ generation: number; children: ReactNode }>) {
  const reduced = useViewportMatch('(prefers-reduced-motion: reduce)')
  const groupRef = useRef<HTMLDivElement>(null)
  const settledGeneration = useRef(generation)
  useEffect(() => {
    const group = groupRef.current
    if (generation === settledGeneration.current || !group) return
    settledGeneration.current = generation
    const settle = resolveMotionPreset('list-enter', reduced)
    if (settle.scaleFrom === 1) return
    const run = animate(settle.scaleFrom, 1, {
      duration: settle.enterDuration / 1000, ease: settle.enterEasing,
      onUpdate: (scale) => { group.style.transform = `scale(${scale})` },
      onComplete: () => group.style.removeProperty('transform'),
    })
    return () => {
      run.stop()
      group.style.removeProperty('transform')
    }
  }, [generation, reduced])
  return <div ref={groupRef} data-list-bulk-settle={generation} className="min-w-0">{children}</div>
}

function useExitDeadline(duration: number) {
  const scope = useListScope()
  const [present, remove] = usePresence()
  const scopeWhilePresent = useRef(scope)
  useEffect(() => {
    if (present) { scopeWhilePresent.current = scope; return }
    if (duration === 0 || scopeWhilePresent.current !== scope) { remove(); return }
    const timer = setTimeout(() => remove(), duration)
    return () => clearTimeout(timer)
  }, [duration, present, remove, scope])
  return present
}

export function ListMotionItem({ children, className, style, ref, positionMotion = true, layoutMotion = true, as = 'div' }: Readonly<{
  ref?: Ref<HTMLDivElement>
  /** The element of the row. A row of a `ul` passes `li`. Default `div`. */
  as?: 'div' | 'li'
  children: ReactNode
  className?: string
  style?: CSSProperties
  positionMotion?: boolean
  /** False keeps the preset shift of the entry and the exit but lets the gap close at once, with no glide of the other rows. */
  layoutMotion?: boolean
}>) {
  const reduced = useViewportMatch('(prefers-reduced-motion: reduce)')
  const scopeContext = useContext(ListScopeContext)
  const enter = resolveMotionPreset('list-enter', reduced)
  const exit = scopeContext.bulk ? { ...resolveMotionPreset('list-exit', reduced), exitDuration: 0, shift: 0 } : resolveMotionPreset('list-exit', reduced)
  const present = useExitDeadline(exit.exitDuration)
  const presence = useContext(PresenceContext)
  const [mountedByScopeChange] = useState(() => scopeContext.committedScope.current !== scopeContext.scope)
  const Item = (as === 'li' ? motion.li : motion.div) as typeof motion.div
  return <PresenceContext.Provider value={null}><Item ref={ref} layout={reduced || scopeContext.bulk || !positionMotion || !layoutMotion ? false : 'position'}
    data-list-motion="" className={className} style={style} inert={!present} aria-hidden={!present || undefined}
    initial={presence?.initial === false || mountedByScopeChange ? false : reduced || !positionMotion ? { opacity: 0 } : { opacity: 0, y: enter.shift }}
    animate={present ? reduced || !positionMotion ? { opacity: 1 } : { opacity: 1, y: 0 } : { opacity: 0, ...(reduced || !positionMotion ? {} : { y: exit.shift }), transition: { duration: exit.exitDuration / 1000, ease: exit.exitEasing } }}
    transition={{ duration: enter.enterDuration / 1000, ease: enter.enterEasing,
      layout: reduced ? { duration: 0 } : { type: 'spring', ...motionSprings.soft } }}>
    {children}
  </Item></PresenceContext.Provider>
}

export function MotionDisclosure({ expanded, id, children, positionMotion = true }: Readonly<{ expanded: boolean; id?: string; children: ReactNode; positionMotion?: boolean }>) {
  const reduced = useViewportMatch('(prefers-reduced-motion: reduce)')
  const enter = resolveMotionPreset('list-enter', reduced)
  const [previousExpanded, setPreviousExpanded] = useState(expanded)
  const [revealing, setRevealing] = useState(false)
  if (expanded !== previousExpanded) {
    setPreviousExpanded(expanded)
    setRevealing(expanded)
  }
  const revealMotion = revealing && !reduced
  let body: ReactNode = null
  if (!positionMotion) body = <div className="flex flex-col gap-2">{children}</div>
  else if (expanded) body = <motion.div className="flex flex-col gap-2" initial={revealMotion ? { opacity: 0, y: -enter.shift } : false}
    animate={{ opacity: 1, y: 0 }} transition={{ duration: enter.enterDuration / 1000, ease: enter.enterEasing }}>{children}</motion.div>
  return <div id={id} hidden={!expanded} inert={!expanded} aria-hidden={!expanded || undefined} data-motion-disclosure="" className="habit-row-group">{body}</div>
}

export function ContentFade({ children }: Readonly<{ children: ReactNode }>) {
  return <div className="relative content-fade" data-content-fade="">{children}</div>
}

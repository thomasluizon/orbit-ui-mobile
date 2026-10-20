'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useTranslations } from 'next-intl'
import { animate, motion, useMotionValue } from 'motion/react'
import { motionDurations, motionEasings, TOUCH_TARGET_MIN } from '@orbit/shared/theme'
import { isStreakCelebrationMilestone, type CelebrationQueueItem } from '@orbit/shared/stores'
import { X } from '@/components/ui/icons'
import { Button } from '@/components/ui/pill-button'
import { OrbitMark } from '@/components/ui/orbit-mark'
import { plural } from '@/lib/plural'
import { useAccountGeneration } from '@/hooks/use-session-reset'
import { getAccountGeneration } from '@/lib/session-epoch'
import { useUIStore } from '@/stores/ui-store'
import { DailyStreakMoment } from './daily-streak-moment'
import { useCelebrationPresentation } from './use-celebration-presentation'

const reduceQuery = '(prefers-reduced-motion: reduce)'
function subscribeReducedMotion(listener: () => void) {
  const query = window.matchMedia(reduceQuery)
  query.addEventListener('change', listener)
  return () => query.removeEventListener('change', listener)
}
function readReducedMotion() { return window.matchMedia(reduceQuery).matches }
function serverReducedMotion() { return true }

function getCelebrationCopy(
  active: NonNullable<ReturnType<typeof useUIStore.getState>['activeCelebration']>,
): {
  eyebrowKey: string
  lineKey: string
  values: Record<string, string | number>
  pluralCount?: number
} {
  switch (active.kind) {
    case 'daily-streak':
    case 'streak':
      return {
        eyebrowKey: 'streak.eyebrow',
        lineKey: 'streak.line',
        values: { count: active.payload.streak },
      }
    case 'goal-completed': {
      const unit = active.payload.unit.trim()
      return {
        eyebrowKey: 'goal.eyebrow',
        lineKey: unit ? 'goal.line' : 'goal.lineWithoutUnit',
        values: unit
          ? { name: active.payload.name, count: active.payload.count, unit }
          : { name: active.payload.name, count: active.payload.count },
      }
    }
    case 'level-up':
      return {
        eyebrowKey: 'level.eyebrow',
        lineKey: 'level.line',
        values: { level: active.payload.level },
      }
    case 'all-done':
      return {
        eyebrowKey: 'day.eyebrow',
        lineKey: 'day.line',
        values: { count: active.payload.count },
        pluralCount: active.payload.count,
      }
  }
}

export function CelebrationPanel() {
  const active = useUIStore((state) => state.activeCelebration)
  const generation = useAccountGeneration()
  const [observed, setObserved] = useState({ id: active?.id, generation })
  if (observed.id !== active?.id) setObserved({ id: active?.id, generation })
  const reduced = useSyncExternalStore(subscribeReducedMotion, readReducedMotion, serverReducedMotion)
  const closeRef = useRef<HTMLButtonElement>(null)
  const originRef = useRef<HTMLElement | null>(null)
  const transferFocus = useRef(false)
  const pendingFocus = useRef(false)
  useEffect(() => {
    const relinquish = (event: Event) => {
      if (event.target !== closeRef.current) pendingFocus.current = false
    }
    document.addEventListener('pointerdown', relinquish, true)
    document.addEventListener('focusin', relinquish, true)
    return () => {
      document.removeEventListener('pointerdown', relinquish, true)
      document.removeEventListener('focusin', relinquish, true)
    }
  }, [])
  const complete = () => {
    const shouldTransfer = pendingFocus.current && generation === getAccountGeneration()
      && (document.activeElement === closeRef.current || document.activeElement === document.body)
    transferFocus.current = false
    pendingFocus.current = false
    if (!active) return
    useUIStore.getState().completeActiveCelebration(active.id)
    if (!shouldTransfer) return
    if (useUIStore.getState().activeCelebration) transferFocus.current = true
    else if (originRef.current?.isConnected) originRef.current.focus({ preventScroll: true })
    else {
      const main = document.querySelector<HTMLElement>('main')
      if (main) { main.tabIndex = -1; main.focus({ preventScroll: true }) }
    }
  }
  useLayoutEffect(() => {
    if (generation !== observed.generation) { pendingFocus.current = false; transferFocus.current = false; originRef.current = null; return }
    if (transferFocus.current) { transferFocus.current = false; closeRef.current?.focus({ preventScroll: true }); return }
    pendingFocus.current = false
    if (document.activeElement instanceof HTMLElement && document.activeElement !== document.body) originRef.current = document.activeElement
  }, [active?.id, generation, observed.generation])
  if (!active || observed.generation !== generation) return null
  if (active.kind === 'streak' && !isStreakCelebrationMilestone(active.payload.streak)) return null
  return <CelebrationItem key={active.id} active={active} reduced={reduced} closeRef={closeRef} complete={complete}
    beforeDismiss={() => { pendingFocus.current = document.activeElement === closeRef.current }} />
}

function CelebrationItem({ active, reduced, closeRef, complete, beforeDismiss }: {
  active: CelebrationQueueItem
  reduced: boolean
  closeRef: React.RefObject<HTMLButtonElement | null>
  complete: () => void
  beforeDismiss: () => void
}) {
  const t = useTranslations()
  const daily = active.kind === 'daily-streak'
  const { eyebrowKey, lineKey, values, pluralCount } = getCelebrationCopy(active)
  const translatedLine = t(`celebration.${lineKey}`, values)
  const line = pluralCount === undefined ? translatedLine : plural(translatedLine, pluralCount)
  const label = daily ? plural(t('streakDisplay.badge.tooltip', { count: active.payload.streak }), active.payload.streak) : line
  const [announcement, setAnnouncement] = useState('')
  const announced = useRef(false)
  const { presentation, snapshot } = useCelebrationPresentation(active.id, daily, reduced, complete)
  const { phase, revision, hidden } = snapshot
  const exiting = phase === 'manual-exit' || phase === 'automatic-exit'
  const entering = phase === 'enter' && !reduced && !hidden
  const y = useMotionValue(0)
  const opacity = useMotionValue(1)
  useEffect(() => {
    if (announced.current) return
    const timeout = setTimeout(() => { announced.current = true; setAnnouncement(label) }, 0)
    return () => clearTimeout(timeout)
  }, [label])
  useLayoutEffect(() => {
    if (reduced || hidden) { y.set(0); opacity.set(1); return }
    if (phase === 'hold') { y.set(0); opacity.set(1); return }
    if (phase === 'enter') y.set(12)
    const transition = { duration: (exiting ? motionDurations.base : motionDurations.slow) / 1000,
      ease: [...(exiting ? motionEasings.exit : motionEasings.enter)] as [number, number, number, number] }
    const movement = animate(y, exiting ? 12 : 0, transition)
    const fade = exiting ? animate(opacity, 0, { ...transition, onComplete: () => presentation.finishExit(revision) }) : null
    return () => { movement.stop(); fade?.stop() }
  }, [exiting, hidden, opacity, phase, presentation, reduced, revision, y])
  const dismiss = () => { if (phase === 'manual-exit') return; beforeDismiss(); presentation.dismiss() }
  return (
    <motion.section aria-label={label} data-celebration-panel={daily ? undefined : ''}
      data-daily-streak-moment={daily ? '' : undefined} data-phase={phase} data-motion={reduced ? 'static' : 'animated'}
      data-entering={entering || undefined} style={{ y, opacity }}
      onFocusCapture={() => presentation.pause('focus', true)}
      onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) presentation.pause('focus', false) }}
      onPointerEnter={(event) => { if (event.pointerType === 'mouse') presentation.pause('hover', true) }}
      onPointerLeave={() => presentation.pause('hover', false)}
      className={daily
        ? 'celebration-notice flex flex-wrap items-center gap-[12px] rounded-[20px] bg-[var(--bg-elev)] p-4 shadow-[var(--sh-2),inset_0_0_0_1px_var(--hairline)]'
        : 'celebration-notice flex flex-wrap items-center gap-4 rounded-[20px] bg-[var(--bg-elev)] p-6 shadow-[var(--sh-2),inset_0_0_0_1px_var(--hairline)]'}>
      <span role="status" aria-atomic="true" className="sr-only">{announcement}</span>
      <CelebrationRing />
      {daily ? <DailyStreakMoment streak={active.payload.streak} entering={entering} /> : (
        <div className="celebration-copy min-w-0 flex-1" aria-hidden="true">
          <p className="font-mono text-xs uppercase tracking-[0.06em] text-[var(--fg-3)]">{t(`celebration.${eyebrowKey}`)}</p>
          <p className="text-[17px] leading-[1.45] text-[var(--fg-1)]">{line}</p>
        </div>
      )}
      <Button buttonRef={closeRef} variant="ghost" quiet iconOnly minimumHeight={TOUCH_TARGET_MIN}
        label={t('celebration.close')} disabled={phase === 'manual-exit'} onClick={dismiss}>
        <X aria-hidden="true" size={20} />
      </Button>
    </motion.section>
  )
}

function CelebrationRing() {
  const [length, setLength] = useState(0)
  const measure = useCallback((circle: SVGCircleElement | null) => {
    const measured = circle && typeof circle.getTotalLength === 'function' ? circle.getTotalLength() : undefined
    if (measured !== undefined && Number.isFinite(measured) && measured > 0) setLength(measured)
  }, [])
  return (
    <div aria-hidden="true" className="relative size-[44px] shrink-0">
      <svg className="size-[44px]" viewBox="0 0 44 44">
        <circle cx="22" cy="22" r="18" fill="none" stroke="var(--status-empty)" strokeWidth="2" />
        <circle ref={measure} className={length ? 'celebration-ring' : undefined} cx="22" cy="22" r="18" fill="none"
          stroke="var(--fg-1)" strokeWidth="3" strokeLinecap="round" strokeDasharray={length || undefined}
          style={{ '--celebration-ring-length': length } as React.CSSProperties} transform="rotate(-90 22 22)" />
      </svg>
      <span className="pointer-events-none absolute inset-0 flex items-center justify-center"><OrbitMark size={16} accent={false} /></span>
    </div>
  )
}

'use client'

import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from 'react'
import { motion } from 'motion/react'
import type { QuestionFlowProps } from '@orbit/shared/contracts/flow'
import { createQuestionFlowHooks } from '@orbit/shared/hooks/question-flow-core'
import { createUseStepChange } from '@orbit/shared/hooks/step-change-core'
import { motionDurations, motionEasings, TOUCH_TARGET_MIN } from '@orbit/shared/theme'
import { ArrowLeft, X } from '@/components/ui/icons'
import { OrbitMascot } from '@/components/ui/orbit-mascot'
import { PagerSegments } from '@/components/ui/pager'
import { PillButton } from '@/components/ui/pill-button'
import { PrimaryActionSlot } from '@/components/ui/primary-action-slot'
import { useOrbitLook } from '@/hooks/use-orbit-look'
import { useViewportMatch } from '@/hooks/use-viewport-match'
import { captureGuidedFlowEvent } from '@/lib/posthog'

const WIDE_SHIFT = 12
const COMPACT_HEADER_CONTROL = 40
const subscribeNever = () => () => {}
function useServerRender() { return useSyncExternalStore(subscribeNever, () => false, () => true) }
const useStepChange = createUseStepChange({ useEffect, useRef })
const { useFlowAnnouncement, useLineAfterArrival, useGuidedFlowTracking } = createQuestionFlowHooks({ useState, useEffect, useRef, capture: (event) => captureGuidedFlowEvent(event) })

export { useFlowAnnouncement, useLineAfterArrival }

function HeaderButton({ label, onPress, compact, children }: Readonly<{ label: string; onPress: () => void; compact: boolean; children: React.ReactNode }>) {
  return <PillButton variant="ghost" iconOnly label={label} minimumHeight={compact ? COMPACT_HEADER_CONTROL : TOUCH_TARGET_MIN} onClick={onPress}>{children}</PillButton>
}

function FlowHeader({ props, compact }: Readonly<{ props: QuestionFlowProps; compact: boolean }>) {
  const { position, total, progressLabel, backLabel, closeLabel, onBack, onClose } = props
  return (
    <header className="mx-auto flex min-h-14 w-full max-w-[592px] items-center gap-2 px-4">
      <span className="flex size-12 shrink-0 items-center justify-center lg:size-10">
        {onBack ? <HeaderButton label={backLabel} onPress={onBack} compact={compact}><ArrowLeft aria-hidden="true" size={24} /></HeaderButton> : null}
      </span>
      <div className="min-w-0 flex-1"><PagerSegments count={total} index={position - 1} label={progressLabel} /></div>
      <span className="flex size-12 shrink-0 items-center justify-center lg:size-10">
        {onClose && closeLabel ? <HeaderButton label={closeLabel} onPress={onClose} compact={compact}><X aria-hidden="true" size={24} /></HeaderButton> : null}
      </span>
    </header>
  )
}

function FlowPrimaryAction({ primary }: Readonly<{ primary: NonNullable<QuestionFlowProps['primary']> }>) {
  return (
    <div data-flow-primary="" className="w-full">
      <PrimaryActionSlot>
        <PillButton variant={primary.variant} loading={primary.loading} disabled={primary.disabled} focusableWhenLoading hint={primary.hint} onClick={primary.onPress}>{primary.label}</PillButton>
      </PrimaryActionSlot>
    </div>
  )
}

function useQuestionFocus(stepKey: string, onStepChange: () => void) {
  const headingRef = useRef<HTMLHeadingElement>(null)
  const focusQuestion = useCallback(() => {
    headingRef.current?.focus({ preventScroll: true })
    onStepChange()
  }, [onStepChange])
  useStepChange(stepKey, focusQuestion)
  return headingRef
}

function mascotLook<Look>(orbitState: QuestionFlowProps['orbitState'], lookAt: Look): Look | null {
  return orbitState === 'parado' ? lookAt : null
}

function stepDuration(reducedMotion: boolean) {
  return reducedMotion ? 0 : motionDurations.slow
}

function FlowLine({ id, line, lineKey, reducedMotion }: Readonly<{ id: string; line: string; lineKey: string | undefined; reducedMotion: boolean }>) {
  const [shown, setShown] = useState({ lineKey, fade: false })
  if (shown.lineKey !== lineKey) setShown({ lineKey, fade: true })
  const fade = shown.lineKey !== lineKey || shown.fade
  if (lineKey === undefined) return <p id={id} className="wrap-anywhere text-base leading-6 text-[var(--fg-2)]">{line}</p>
  return (
    <motion.p key={lineKey} id={id} data-line-key={lineKey} data-line-duration={reducedMotion ? motionDurations.instant : motionDurations.micro}
      initial={fade && !reducedMotion ? { opacity: 0 } : false} animate={{ opacity: 1 }}
      transition={{ duration: reducedMotion ? 0 : motionDurations.micro / 1000, ease: [...motionEasings.standard] as [number, number, number, number] }}
      className="wrap-anywhere text-base leading-6 text-[var(--fg-2)]">{line}</motion.p>
  )
}

function stepTravel(direction: 1 | -1, shift: number | undefined) {
  if (shift === undefined) return { x: `${direction * 100}%`, opacity: 1 }
  return { x: direction * shift, opacity: 0 }
}

/** The one-question flow frame. It holds no habit-specific code: a second consumer mounts it with its own content. Its host owns the landmark: the shell or the sign-in frame holds `main`, and `FlowScreen` holds the region or the dialog. */
export function QuestionFlow(props: Readonly<QuestionFlowProps>) {
  const { flow, question, line, lineKey, stepKey, direction, orbitState = 'parado', showOrbit = true, statusText, options, children, primary, footer } = props
  const wide = useViewportMatch('(min-width: 1024px)')
  const sm = useViewportMatch('(min-width: 640px)')
  const reducedMotion = useViewportMatch('(prefers-reduced-motion: reduce)')
  const serverRender = useServerRender()
  const hoverCapable = useViewportMatch('(hover: hover)')
  const lineId = useId()
  const { mascotRef, lookAt, lookTowards, lookAway } = useOrbitLook()
  const headingRef = useQuestionFocus(stepKey, lookAway)
  const announcement = useFlowAnnouncement(line, stepKey)
  useGuidedFlowTracking(flow, stepKey, props.total)

  const hoveredOption = (target: EventTarget) => wide && hoverCapable && target instanceof HTMLElement ? target.closest('[data-option-card]') : null
  const primaryAction = primary ? <FlowPrimaryAction primary={primary} /> : null
  const visibleOrbitState = showOrbit ? orbitState : undefined

  return (
    <div data-question-flow="" data-step={stepKey} data-orbit-state={visibleOrbitState} className="flex min-h-0 flex-1 flex-col">
      <FlowHeader props={props} compact={wide} />
      <div data-flow-scroll="" className="flex min-h-0 flex-1 flex-col items-center overflow-y-auto px-4">
        <motion.div
          key={stepKey}
          role="presentation"
          data-step-duration={stepDuration(reducedMotion)}
          initial={reducedMotion || serverRender ? false : stepTravel(direction, sm ? WIDE_SHIFT : undefined)}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: stepDuration(reducedMotion) / 1000, ease: [...motionEasings.standard] as [number, number, number, number] }}
          onFocusCapture={(event) => lookTowards(event.target)}
          onBlurCapture={lookAway}
          onPointerOver={(event) => lookTowards(hoveredOption(event.target))}
          onPointerLeave={lookAway}
          className="my-auto flex w-full max-w-[592px] flex-col items-center gap-6 py-4 text-center"
        >
          {showOrbit ? <span ref={mascotRef} aria-hidden="true"><OrbitMascot size={wide ? 128 : 96} state={orbitState} lookAt={mascotLook(orbitState, lookAt)} turnKey={stepKey} /></span> : null}
          {line ? <FlowLine id={lineId} line={line} lineKey={lineKey} reducedMotion={reducedMotion} /> : null}
          <h1 ref={headingRef} tabIndex={-1} aria-describedby={line ? lineId : undefined} className="orbit-flow-question text-balance font-display text-[28px] leading-[1.18] text-[var(--fg-1)]">{question}</h1>
          {options ? <div role="group" aria-label={question} data-option-group="" className="grid w-full grid-cols-2 gap-3">{options}</div> : null}
          {children ? <div className="flex w-full flex-col gap-3 text-start">{children}</div> : null}
          {wide ? primaryAction : null}
          {footer}
        </motion.div>
      </div>
      <span role="status" aria-live="polite" className="sr-only">{announcement || statusText}</span>
      {wide || !primaryAction ? null : <div className="mx-auto w-full max-w-[592px] px-4 pb-4 pt-2">{primaryAction}</div>}
    </div>
  )
}

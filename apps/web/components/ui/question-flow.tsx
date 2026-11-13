'use client'

import { useEffect, useId, useRef } from 'react'
import { motion } from 'motion/react'
import type { QuestionFlowProps } from '@orbit/shared/contracts/flow'
import { motionDurations, motionEasings } from '@orbit/shared/theme'
import { ArrowLeft, X } from '@/components/ui/icons'
import { OrbitMascot } from '@/components/ui/orbit-mascot'
import { PagerSegments } from '@/components/ui/pager'
import { PillButton } from '@/components/ui/pill-button'
import { useFlowAnnouncement } from '@/hooks/use-flow-announcement'
import { useGuidedFlowTracking } from '@/hooks/use-guided-flow-tracking'
import { useOrbitLook } from '@/hooks/use-orbit-look'
import { useViewportMatch } from '@/hooks/use-viewport-match'

const WIDE_SHIFT = 12
function HeaderButton({ label, onPress, children }: Readonly<{ label: string; onPress: () => void; children: React.ReactNode }>) {
  return <PillButton variant="ghost" iconOnly label={label} minimumHeight={48} onClick={onPress}>{children}</PillButton>
}

function FlowHeader({ props }: Readonly<{ props: QuestionFlowProps }>) {
  const { position, total, progressLabel, backLabel, closeLabel, onBack, onClose } = props
  return (
    <header className="mx-auto flex min-h-14 w-full max-w-[592px] items-center gap-2 px-4">
      <span className="flex size-12 shrink-0 items-center justify-center">
        {onBack ? <HeaderButton label={backLabel} onPress={onBack}><ArrowLeft aria-hidden="true" size={24} /></HeaderButton> : null}
      </span>
      <div className="min-w-0 flex-1"><PagerSegments count={total} index={position - 1} label={progressLabel} /></div>
      <HeaderButton label={closeLabel} onPress={onClose}><X aria-hidden="true" size={24} /></HeaderButton>
    </header>
  )
}

function FlowPrimaryAction({ primary, wide }: Readonly<{ primary: NonNullable<QuestionFlowProps['primary']>; wide: boolean }>) {
  return (
    <div className={wide ? 'flex w-full justify-center pt-6' : 'w-full'}>
      <div className={wide ? 'w-full max-w-[360px]' : 'w-full'}>
        <PillButton loading={primary.loading} focusableWhenLoading hint={primary.hint} onClick={primary.onPress}>{primary.label}</PillButton>
      </div>
    </div>
  )
}

function useQuestionFocus(stepKey: string, onStepChange: () => void) {
  const headingRef = useRef<HTMLHeadingElement>(null)
  const firstStep = useRef(stepKey)
  useEffect(() => {
    if (firstStep.current === stepKey) return
    headingRef.current?.focus({ preventScroll: true })
    onStepChange()
  }, [stepKey, onStepChange])
  return headingRef
}

function stepTravel(direction: 1 | -1, shift: number | undefined) {
  if (shift === undefined) return { x: `${direction * 100}%`, opacity: 1 }
  return { x: direction * shift, opacity: 0 }
}

/** The one-question flow frame. It holds no habit-specific code: a second consumer mounts it with its own content. */
export function QuestionFlow(props: Readonly<QuestionFlowProps>) {
  const { flow, question, line, stepKey, direction, orbitState = 'parado', statusText, options, children, primary, footer } = props
  const wide = useViewportMatch('(min-width: 1024px)')
  const sm = useViewportMatch('(min-width: 640px)')
  const reducedMotion = useViewportMatch('(prefers-reduced-motion: reduce)')
  const hoverCapable = useViewportMatch('(hover: hover)')
  const lineId = useId()
  const { mascotRef, lookAt, lookTowards, lookAway } = useOrbitLook()
  const headingRef = useQuestionFocus(stepKey, lookAway)
  const announcement = useFlowAnnouncement(line, stepKey)
  useGuidedFlowTracking(flow, stepKey, props.total)

  const hoveredOption = (target: EventTarget) => wide && hoverCapable && target instanceof HTMLElement ? target.closest('[data-option-card]') : null
  const primaryAction = primary ? <FlowPrimaryAction primary={primary} wide={wide} /> : null

  return (
    <div data-question-flow="" data-step={stepKey} data-orbit-state={orbitState} className="flex min-h-0 flex-1 flex-col">
      <FlowHeader props={props} />
      <main className="flex min-h-0 flex-1 flex-col items-center overflow-y-auto px-4">
        <motion.div
          key={stepKey}
          role="presentation"
          initial={reducedMotion ? false : stepTravel(direction, sm ? WIDE_SHIFT : undefined)}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: reducedMotion ? 0 : motionDurations.slow / 1000, ease: [...motionEasings.standard] as [number, number, number, number] }}
          onFocusCapture={(event) => lookTowards(event.target)}
          onBlurCapture={lookAway}
          onPointerOver={(event) => lookTowards(hoveredOption(event.target))}
          onPointerLeave={lookAway}
          className="my-auto flex w-full max-w-[592px] flex-col items-center gap-6 py-4 text-center"
        >
          <span ref={mascotRef} aria-hidden="true"><OrbitMascot size={wide ? 128 : 96} state={orbitState} lookAt={orbitState === 'parado' ? lookAt : null} turnKey={stepKey} /></span>
          {line ? <p id={lineId} className="text-base leading-6 text-[var(--fg-2)]">{line}</p> : null}
          <h1 ref={headingRef} tabIndex={-1} aria-describedby={line ? lineId : undefined} className="orbit-flow-question text-balance font-display text-[28px] leading-[1.18] text-[var(--fg-1)] lg:text-[34px] lg:leading-[1.15]">{question}</h1>
          {options ? <div role="group" aria-label={question} data-option-group="" className="grid w-full grid-cols-2 gap-3">{options}</div> : null}
          {children ? <div className="flex w-full flex-col gap-3 text-start">{children}</div> : null}
          {wide ? primaryAction : null}
          {footer}
        </motion.div>
      </main>
      <span role="status" aria-live="polite" className="sr-only">{announcement || statusText}</span>
      {wide || !primaryAction ? null : <div className="mx-auto w-full max-w-[592px] px-4 pb-4 pt-2">{primaryAction}</div>}
    </div>
  )
}

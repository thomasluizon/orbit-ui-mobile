'use client'

import * as m from 'motion/react-m'
import { useState, type ReactNode } from 'react'
import { LazyMotion, domMin } from 'motion/react'
import { motionDurations, motionEasings, motionLayerTiming } from '@orbit/shared/theme'
import { useViewportMatch } from '@/hooks/use-viewport-match'

export function OnboardingStepStage({ step, children }: Readonly<{ step: number; children: ReactNode }>) {
  const reduced = useViewportMatch('(prefers-reduced-motion: reduce)')
  const [trackedStep, setTrackedStep] = useState(step)
  const [stepChanged, setStepChanged] = useState(false)
  if (trackedStep !== step) {
    setTrackedStep(step)
    setStepChanged(true)
  }
  const entering = stepChanged && !reduced
  return (
    <LazyMotion features={domMin}>
      <m.div key={step} className="flex flex-col" data-onboarding-step={step}
        initial={entering ? { opacity: 0, y: motionLayerTiming.routeShift } : false}
        animate={{ opacity: 1, y: 0, transition: { duration: entering ? motionDurations.base / 1000 : 0, ease: motionEasings.enter } }}
      >{children}</m.div>
    </LazyMotion>
  )
}

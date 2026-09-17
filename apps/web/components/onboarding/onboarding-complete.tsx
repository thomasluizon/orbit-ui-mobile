'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { PillButton } from '@/components/ui/pill-button'
import { StatusRing } from '@/components/ui/status-ring'

interface OnboardingCompleteProps {
  createdHabit: string
  emoji: string
  remindersOff: boolean
  skipped: boolean
  signedOut: boolean
  onFinish: () => void
}

function LandingRing() {
  const accentRef = useRef<SVGCircleElement>(null)
  const [swept, setSwept] = useState(false)
  useEffect(() => {
    const circle = accentRef.current
    if (!circle || typeof circle.animate !== 'function' || globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setSwept(true)
      return
    }
    const length = circle.getTotalLength()
    circle.style.strokeDasharray = String(length)
    circle.style.strokeDashoffset = String(length)
    const animation = circle.animate([{ strokeDashoffset: length }, { strokeDashoffset: 0 }], { duration: 280, easing: 'ease-out' })
    animation.onfinish = () => setSwept(true)
    return () => animation.cancel()
  }, [])
  return <svg width="56" height="56" viewBox="0 0 34 34" aria-hidden="true"><circle cx="17" cy="17" r="15.5" fill="none" stroke="var(--status-empty)" strokeWidth="1.5" /><circle ref={accentRef} cx="17" cy="17" r="15.5" fill="none" stroke="var(--primary)" strokeWidth="2.5" strokeLinecap="round" transform="rotate(-90 17 17)" opacity={swept ? 0 : 1} /></svg>
}

export function OnboardingComplete({ createdHabit, emoji, remindersOff, skipped, signedOut, onFinish }: Readonly<OnboardingCompleteProps>) {
  const t = useTranslations('onboarding.flow.done')
  const titleKey = signedOut ? 'signedOutTitle' : skipped ? 'skippedTitle' : 'title'
  const bodyKey = signedOut ? 'signedOutBody' : skipped ? 'skippedBody' : remindersOff ? 'remindersOffBody' : 'body'
  return (
    <section className="mx-auto flex w-full max-w-md flex-col gap-6 py-8">
      <div className="flex flex-col items-start gap-3">{createdHabit ? <LandingRing /> : null}<h1 id="onboarding-title" className="m-0 text-pretty font-display text-[22px] font-medium leading-[1.2] tracking-[-0.02em] text-[var(--fg-1)] lg:text-[28px] lg:leading-[1.15]">{t(titleKey)}</h1><p className="m-0 text-pretty text-[17px] leading-[1.55] text-[var(--fg-2)]">{t(bodyKey)}</p></div>
      {createdHabit ? <div className="flex items-center gap-4 rounded-[20px] bg-[var(--bg-card)] p-4 shadow-[inset_0_0_0_1px_var(--hairline-ghost)]"><span className="grid size-11 place-items-center rounded-[12px] bg-[var(--bg-well)] text-2xl">{emoji}</span><span className="min-w-0 flex-1"><strong className="block text-[var(--fg-1)]">{createdHabit}</strong><small className="text-[var(--fg-3)]">{t('pending')}</small></span><StatusRing status="empty" size={30} label={t('pending')} /></div> : null}
      <PillButton onClick={onFinish}>{signedOut ? t('signIn') : t('seeDay')}</PillButton>
    </section>
  )
}

'use client'

import type { ReactNode, Ref } from 'react'
import { useTranslations } from 'next-intl'
import type { OrbitLookTarget } from '@orbit/shared/contracts/brand'
import { ShellCentredRegion } from '@/components/shell/shell-centred-region'
import { OrbitMascot, useStateMascotSize } from '@/components/ui/orbit-mascot'

interface SearchQuestionBlockProps {
  /** No query yet: the block is the whole screen, centred, with Orbit above the question. */
  resting: boolean
  mascotRef: Ref<HTMLSpanElement>
  lookAt: OrbitLookTarget | null
  children: ReactNode
}

/** The search question with its field. The question is the `h1` of the route and the label of the field. */
export function SearchQuestionBlock({ resting, mascotRef, lookAt, children }: Readonly<SearchQuestionBlockProps>) {
  const t = useTranslations()
  const mascotSize = useStateMascotSize()
  return (
    <ShellCentredRegion centred={resting}>
      <div data-search-block={resting ? 'resting' : 'results'} className="mx-auto flex w-full max-w-[592px] flex-col items-center gap-6 p-4 text-center">
        {resting ? <span ref={mascotRef} aria-hidden="true" className="flex"><OrbitMascot size={mascotSize} lookAt={lookAt} /></span> : null}
        <div className="flex w-full flex-col gap-3">
          <h1 tabIndex={-1} className="orbit-flow-question text-balance font-display text-[28px] leading-[1.18] text-[var(--fg-1)] lg:text-[34px] lg:leading-[1.15]">{t('habits.search.question')}</h1>
          {children}
        </div>
      </div>
    </ShellCentredRegion>
  )
}

/** Orbit at 48 beside the one sentence about the result set. Orbit is Parado after a miss and on a load error. */
export function SearchOrbitLine({ mascotRef, lookAt, children }: Readonly<{ mascotRef: Ref<HTMLSpanElement>; lookAt: OrbitLookTarget | null; children: ReactNode }>) {
  return (
    <div data-search-orbit-line="" className="flex min-h-12 items-center gap-3 px-1">
      <span ref={mascotRef} aria-hidden="true" className="flex w-12 shrink-0 justify-center"><OrbitMascot size={48} lookAt={lookAt} /></span>
      <div className="min-w-0 flex-1 text-base leading-[1.4] text-[var(--fg-2)]">{children}</div>
    </div>
  )
}

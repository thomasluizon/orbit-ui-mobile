'use client'

import { useId, useState, type Ref } from 'react'
import Link from 'next/link'
import type { OrbitLookTarget } from '@orbit/shared/contracts/brand'
import { motionDurations, motionEasings } from '@orbit/shared/theme'
import { OrbitMascot } from '@/components/ui/orbit-mascot'
import { Skeleton } from '@/components/ui/skeleton'
import { useFlag } from '@/hooks/use-flag'
import { useViewportMatch } from '@/hooks/use-viewport-match'

interface TodayOrbitLineProps {
  text: string
  destination: string
  href?: string
  onPress?: () => void
  disabled?: boolean
  busy?: boolean
  announce?: boolean
  loading?: boolean
  mascotState?: 'parado' | 'pensando' | 'descansando'
  gutter?: boolean
  lookAt?: OrbitLookTarget | null
  turnKey?: string | number
  mascotRef?: Ref<HTMLSpanElement>
}

const SENTENCE_CHANGE = `today-orbit-sentence-in ${motionDurations.micro}ms cubic-bezier(${motionEasings.standard.join(', ')})`

function useSentenceChanged(text: string): boolean {
  const [first] = useState(text)
  const [changed, setChanged] = useState(false)
  if (!changed && text !== first) setChanged(true)
  return changed
}

export function TodayOrbitLine({ text, destination, href, onPress, disabled = false, busy = false, announce = false, loading = false, mascotState = 'parado', gutter = true, lookAt, turnKey, mascotRef }: Readonly<TodayOrbitLineProps>) {
  const guided = useFlag('orbit_guided_flows')
  const destinationId = useId()
  const reducedMotion = useViewportMatch('(prefers-reduced-motion: reduce)')
  const fade = useSentenceChanged(text) && guided && !reducedMotion
  const content = <>
    <span ref={mascotRef} aria-hidden="true" className="relative flex w-[48px] shrink-0 items-center justify-center">
      {guided ? <OrbitMascot size={48} live="withLead" state={mascotState} lookAt={lookAt} turnKey={turnKey} /> : <OrbitMascot size={48} live="withLead" />}
    </span>
    <span className="today-orbit-sentence" aria-live={announce ? 'polite' : undefined}>
      {loading ? <><span className="sr-only">{text}</span><span data-summary-skeleton aria-hidden="true" className="flex min-h-[2lh] flex-col justify-center gap-2"><span className="block h-[14px] w-full"><Skeleton variant="fill" grouped /></span><span className="block h-[14px] w-2/3"><Skeleton variant="fill" grouped /></span></span></>
        : <span key={text} data-sentence-change={fade ? '' : undefined} style={fade ? { animation: SENTENCE_CHANGE } : undefined}>{text}</span>}
    </span>
  </>
  const waitingSurface = loading ? { background: 'transparent' } : undefined
  const orbitLine = guided ? '' : undefined
  return <div className={gutter ? 'px-screen-gutter' : undefined} data-today-orbit-slot aria-busy={busy}>
    {href ? <Link className="today-orbit-line" data-orbit-line={orbitLine} style={waitingSurface} href={href} aria-describedby={destinationId}>{content}</Link>
      : <button type="button" className="today-orbit-line" data-orbit-line={orbitLine} style={waitingSurface} aria-describedby={destinationId} disabled={disabled} onClick={onPress}>{content}</button>}
    <span id={destinationId} className="sr-only">{destination}</span>
  </div>
}

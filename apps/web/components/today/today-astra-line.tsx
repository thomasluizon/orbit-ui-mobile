'use client'

import { useId, useState, type Ref } from 'react'
import Link from 'next/link'
import type { OrbitLookTarget, OrbitMascotProps } from '@orbit/shared/contracts/brand'
import { motionDurations, motionEasings } from '@orbit/shared/theme'
import { OrbitMascot } from '@/components/ui/orbit-mascot'
import { useViewportMatch } from '@/hooks/use-viewport-match'

interface TodayAstraLineProps {
  text: string
  destination: string
  href?: string
  onPress?: () => void
  disabled?: boolean
  busy?: boolean
  announce?: boolean
  loading?: boolean
  /** Orbit's state in the row, for example Descansando while the AI is unavailable. */
  mascotState?: OrbitMascotProps['state']
  /** The control Orbit looks toward, measured from `mascotRef`. */
  lookAt?: OrbitLookTarget | null
  /** A page change the person caused: the ring turns once. */
  turnKey?: string | number
  mascotRef?: Ref<HTMLSpanElement>
}

const SENTENCE_CHANGE = `today-astra-sentence-in ${motionDurations.micro}ms cubic-bezier(${motionEasings.standard.join(', ')})`

/** True after the first change of the sentence, so the first render never fades in. */
function useSentenceChanged(text: string): boolean {
  const [first] = useState(text)
  const [changed, setChanged] = useState(false)
  if (!changed && text !== first) setChanged(true)
  return changed
}

export function TodayAstraLine({ text, destination, href, onPress, disabled = false, busy = false, announce = false, loading = false, mascotState, lookAt, turnKey, mascotRef }: Readonly<TodayAstraLineProps>) {
  const destinationId = useId()
  const reducedMotion = useViewportMatch('(prefers-reduced-motion: reduce)')
  const fade = useSentenceChanged(text) && !reducedMotion
  const content = <>
    <span ref={mascotRef} aria-hidden="true" className="relative flex w-[48px] shrink-0 items-center justify-center">
      <OrbitMascot size={48} state={mascotState} lookAt={lookAt} turnKey={turnKey} />
    </span>
    <span className="today-astra-sentence" aria-live={announce ? 'polite' : undefined}>
      {loading ? <><span className="sr-only">{text}</span><span data-summary-skeleton aria-hidden="true" className="flex min-h-[2lh] flex-col justify-center gap-2"><span className="h-[14px] w-full rounded-[8px] bg-[var(--hairline-strong)]" /><span className="h-[14px] w-2/3 rounded-[8px] bg-[var(--hairline-strong)]" /></span></>
        : <span key={text} data-sentence-change={fade ? '' : undefined} style={fade ? { animation: SENTENCE_CHANGE } : undefined}>{text}</span>}
    </span>
  </>
  return <div className="px-screen-gutter" data-today-astra-slot aria-busy={busy}>
    {href ? <Link className="today-astra-line" href={href} aria-describedby={destinationId}>{content}</Link>
      : <button type="button" className="today-astra-line" aria-describedby={destinationId} disabled={disabled} onClick={onPress}>{content}</button>}
    <span id={destinationId} className="sr-only">{destination}</span>
  </div>
}

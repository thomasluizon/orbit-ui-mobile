'use client'

import { useId } from 'react'
import Link from 'next/link'
import { OrbitMascot } from '@/components/ui/orbit-mascot'
import { useFlag } from '@/hooks/use-flag'

interface TodayAstraLineProps {
  text: string
  destination: string
  href?: string
  onPress?: () => void
  disabled?: boolean
  busy?: boolean
  announce?: boolean
  loading?: boolean
  /** Descansando when the AI is absent: offline or at the message limit. */
  resting?: boolean
  /** The Hoje slot keeps the screen gutter. A destination that already insets its content turns it off. */
  gutter?: boolean
}

export function TodayAstraLine({ text, destination, href, onPress, disabled = false, busy = false, announce = false, loading = false, resting = false, gutter = true }: Readonly<TodayAstraLineProps>) {
  const guided = useFlag('orbit_guided_flows')
  const destinationId = useId()
  const content = <>
    <span aria-hidden="true" className="relative flex w-[48px] shrink-0 items-center justify-center">
      {guided ? <OrbitMascot size={48} still state={resting ? 'descansando' : 'parado'} /> : <OrbitMascot size={20} color="var(--fg-3)" />}
    </span>
    <span className="today-astra-sentence" aria-live={announce ? 'polite' : undefined}>
      {loading ? <><span className="sr-only">{text}</span><span data-summary-skeleton aria-hidden="true" className="flex min-h-[2lh] flex-col justify-center gap-2"><span className="h-[14px] w-full rounded-[8px] bg-[var(--hairline-strong)]" /><span className="h-[14px] w-2/3 rounded-[8px] bg-[var(--hairline-strong)]" /></span></> : text}
    </span>
  </>
  return <div className={gutter ? 'px-screen-gutter' : undefined} data-today-astra-slot aria-busy={busy}>
    {href ? <Link className="today-astra-line" href={href} aria-describedby={destinationId}>{content}</Link>
      : <button type="button" className="today-astra-line" aria-describedby={destinationId} disabled={disabled} onClick={onPress}>{content}</button>}
    <span id={destinationId} className="sr-only">{destination}</span>
  </div>
}

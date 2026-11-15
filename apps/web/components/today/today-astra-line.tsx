'use client'

import { useId } from 'react'
import Link from 'next/link'
import { OrbitMascot } from '@/components/ui/orbit-mascot'
import { Skeleton } from '@/components/ui/skeleton'

interface TodayAstraLineProps {
  text: string
  destination: string
  href?: string
  onPress?: () => void
  disabled?: boolean
  busy?: boolean
  announce?: boolean
  loading?: boolean
  /** False inside a surface that already holds the screen gutter, such as the goal detail. Default true. */
  gutter?: boolean
}

export function TodayAstraLine({ text, destination, href, onPress, disabled = false, busy = false, announce = false, loading = false, gutter = true }: Readonly<TodayAstraLineProps>) {
  const destinationId = useId()
  const content = <>
    <span aria-hidden="true" className="relative flex w-[48px] shrink-0 items-center justify-center">
      <OrbitMascot size={48} still />
    </span>
    <span className="today-astra-sentence" aria-live={announce ? 'polite' : undefined}>
      {loading ? <><span className="sr-only">{text}</span><span data-summary-skeleton aria-hidden="true" className="flex min-h-[2lh] flex-col justify-center gap-2"><span className="block h-[14px] w-full"><Skeleton variant="fill" grouped /></span><span className="block h-[14px] w-2/3"><Skeleton variant="fill" grouped /></span></span></> : text}
    </span>
  </>
  const waitingSurface = loading ? { background: 'transparent' } : undefined
  return <div className={gutter ? 'px-screen-gutter' : undefined} data-today-astra-slot aria-busy={busy}>
    {href ? <Link className="today-astra-line" style={waitingSurface} href={href} aria-describedby={destinationId}>{content}</Link>
      : <button type="button" className="today-astra-line" style={waitingSurface} aria-describedby={destinationId} disabled={disabled} onClick={onPress}>{content}</button>}
    <span id={destinationId} className="sr-only">{destination}</span>
  </div>
}

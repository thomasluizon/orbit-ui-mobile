'use client'

import { useId } from 'react'
import Link from 'next/link'
import { AstraGlyph } from '@/components/ui/astra-glyph'

interface TodayAstraLineProps {
  text: string
  destination: string
  href?: string
  onPress?: () => void
  disabled?: boolean
  busy?: boolean
}

export function TodayAstraLine({ text, destination, href, onPress, disabled = false, busy = false }: Readonly<TodayAstraLineProps>) {
  const destinationId = useId()
  const content = <>
    <span aria-hidden="true" className="relative flex w-[48px] shrink-0 items-center justify-center">
      <AstraGlyph size={20} color="var(--fg-3)" />
    </span>
    <span className="today-astra-sentence">{text}</span>
  </>
  return <div className="px-[16px]" data-today-astra-slot aria-busy={busy}>
    {href ? <Link className="today-astra-line" href={href} aria-describedby={destinationId}>{content}</Link>
      : <button type="button" className="today-astra-line" aria-describedby={destinationId} disabled={disabled} onClick={onPress}>{content}</button>}
    <span id={destinationId} className="sr-only">{destination}</span>
  </div>
}

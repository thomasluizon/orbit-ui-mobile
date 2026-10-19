'use client'

import { useId } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import {
  getReturningInterval,
  getTodayAstraLine,
} from '@orbit/shared/utils'
import { useProactiveItem } from '@/hooks/use-proactive-item'
import { useProfile } from '@/hooks/use-profile'
import { AstraGlyph } from '@/components/ui/astra-glyph'

interface TodayAstraProps {
  today: string
  isTodaySelected: boolean
  suppressed: boolean
}

export function TodayAstra({ isTodaySelected, suppressed }: Readonly<TodayAstraProps>) {
  const t = useTranslations()
  const destinationId = useId()
  const { profile } = useProfile()
  const { item: proactive, openItem } = useProactiveItem()
  const line = getTodayAstraLine({
    isTodaySelected, inDrillOrSurface: suppressed, item: proactive,
    returning: getReturningInterval(profile?.lastCompletionDate, profile?.timeZone),
  }, t)

  if (!line) return null

  const content = (
    <>
      <span aria-hidden="true" className="relative flex w-[48px] shrink-0 items-center justify-center">
        <AstraGlyph size={20} color="var(--fg-3)" />
      </span>
      <span className="today-astra-sentence">{line.text}</span>
    </>
  )

  return (
    <div className="px-[16px]">
      {line.item ? (
        <button
          type="button"
          className="today-astra-line"
          aria-describedby={destinationId}
          onClick={() => {
            openItem(line.item)
          }}
        >
          {content}
        </button>
      ) : (
        <Link className="today-astra-line" href="/progress" aria-describedby={destinationId}>
          {content}
        </Link>
      )}
      <span id={destinationId} className="sr-only">{line.destination}</span>
    </div>
  )
}

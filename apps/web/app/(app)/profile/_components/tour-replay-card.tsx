'use client'

import { useState, useId } from 'react'
import { Compass, ChevronRight } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { TourReplayModal } from './tour-replay-modal'

export function TourReplayCard() {
  const t = useTranslations()
  const [showModal, setShowModal] = useState(false)
  const titleId = useId()
  const hintId = useId()

  return (
    <>
      <button
        type="button"
        onClick={() => setShowModal(true)}
        aria-labelledby={titleId}
        aria-describedby={hintId}
        className="w-full rounded-[var(--radius-xl)] border p-5 flex items-center gap-4 text-left shadow-[var(--shadow-sm)] surface-interactive group bg-[var(--bg-elev)] border-[var(--hairline)] hover:bg-[var(--bg-elev)] hover:border-[var(--hairline)]"
      >
        <div className="shrink-0 flex items-center justify-center rounded-[var(--radius-lg)] p-3 transition-colors bg-[var(--bg-sunk)]">
          <Compass className="size-5 text-[var(--primary)]" />
        </div>
        <div className="flex-1 min-w-0">
          <p id={titleId} className="text-sm font-bold text-[var(--fg-1)]">
            {t('tour.replay.title')}
          </p>
          <p id={hintId} className="text-xs text-[var(--fg-2)] mt-0.5">
            {t('tour.replay.hint')}
          </p>
        </div>
        <ChevronRight className="size-4 text-[var(--fg-3)] shrink-0 transition-colors group-hover:text-[var(--fg-1)]" />
      </button>

      <TourReplayModal open={showModal} onOpenChange={setShowModal} />
    </>
  )
}

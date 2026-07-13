'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useTranslations } from 'next-intl'

interface FactsPaginationProps {
  page: number
  totalPages: number
  onPrevious: () => void
  onNext: () => void
}

export function FactsPagination({
  page,
  totalPages,
  onPrevious,
  onNext,
}: Readonly<FactsPaginationProps>) {
  const t = useTranslations()

  return (
    <span
      className="inline-flex items-center"
      style={{
        gap: 2,
        fontFamily: 'var(--font-mono)',
        // react-doctor-disable-next-line no-tiny-text -- intentional mono tabular pagination counter (DESIGN.md meta scale), not body text https://github.com/thomasluizon/orbit-ui-mobile/issues/243
        fontSize: 11,
        color: 'var(--fg-3)',
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      {t('profile.facts.count', { n: page, max: totalPages })}
      <button
        type="button"
        disabled={page === 1}
        onClick={onPrevious}
        aria-label={t('common.previousPage')}
        className="icon-btn disabled:opacity-40 disabled:cursor-not-allowed"
        style={{ color: 'var(--fg-3)' }}
      >
        <ChevronLeft size={17} strokeWidth={1.8} />
      </button>
      <button
        type="button"
        disabled={page === totalPages}
        onClick={onNext}
        aria-label={t('common.nextPage')}
        className="icon-btn disabled:opacity-40 disabled:cursor-not-allowed"
        style={{ color: 'var(--fg-3)' }}
      >
        <ChevronRight size={17} strokeWidth={1.8} />
      </button>
    </span>
  )
}

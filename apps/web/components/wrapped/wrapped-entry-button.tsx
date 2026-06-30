'use client'

import { Gift } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'

/** Chip that launches the free Orbit Wrapped story from the retrospective surface. */
export function WrappedEntryButton() {
  const t = useTranslations()
  const router = useRouter()

  return (
    <button type="button" className="chip" onClick={() => router.push('/wrapped')}>
      <Gift size={14} strokeWidth={1.8} aria-hidden="true" />
      {t('wrapped.entry')}
    </button>
  )
}

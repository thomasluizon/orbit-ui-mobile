'use client'

import { useTranslations } from 'next-intl'
import { EmptyState } from '@/components/ui/empty-state'

export function ChatEmptyState() {
  const t = useTranslations()

  return (
    <div className="flex min-h-full flex-col justify-center-safe" style={{ gap: 24 }} aria-live="off">
      <EmptyState mark="astra" title={t('chat.empty.title')} />
      <p
        className="m-0 self-center text-center"
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: 'var(--fs-xs)',
          color: 'var(--fg-3)',
          maxWidth: 300,
          lineHeight: 1.4,
        }}
      >
        {t('aiDisclosure.notMedicalAdvice')}
      </p>
    </div>
  )
}

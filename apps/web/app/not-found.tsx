'use client'

import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { PillButton } from '@/components/ui/pill-button'
import { OrbitMark } from '@/components/ui/orbit-mark'

export default function NotFound() {
  const t = useTranslations()
  const router = useRouter()
  return (
    <main className="min-h-dvh bg-[var(--bg)]">
      <section className="error-surface" data-state="not-found">
        <OrbitMark size={40} />
        <h1 className="error-surface-title">{t('notFoundPage.title')}</h1>
        <p className="error-surface-body">{t('notFoundPage.description')}</p>
        <div className="error-surface-action">
          {/* eslint-disable-next-line local/max-button-words -- ORB-68 owns this existing label. */}
          <PillButton onClick={() => router.push('/')}>{t('notFoundPage.action')}</PillButton>
        </div>
      </section>
    </main>
  )
}

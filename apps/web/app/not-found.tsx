'use client'

import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { PillButton } from '@/components/ui/pill-button'
import { SatelliteGlyph } from '@/components/ui/satellite-glyph'

export default function NotFound() {
  const t = useTranslations()
  const router = useRouter()

  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-[var(--bg)] px-9 text-center">
      <div className="relative z-[1] flex max-w-[560px] flex-col items-center md:flex-row md:items-center md:gap-8 md:text-left">
        <div
          className="shrink-0"
          style={{ animation: 'fresh-start-orb 0.28s var(--ease-out) both' }}
        >
          <SatelliteGlyph size={104} />
        </div>
        <div className="flex flex-col items-center md:items-start">
          <h1
            className="t-h2"
            style={{
              margin: '18px 0 0',
              textWrap: 'balance',
              animation: 'slide-up-fade 0.28s var(--ease-out) backwards',
              animationDelay: '160ms',
            }}
          >
            {t('notFoundPage.title')}
          </h1>
          <p
            className="t-secondary"
            style={{
              margin: '8px 0 0',
              maxWidth: 300,
              textWrap: 'pretty',
              animation: 'slide-up-fade 0.28s var(--ease-out) backwards',
              animationDelay: '220ms',
            }}
          >
            {t('notFoundPage.description')}
          </p>
          <div
            style={{
              marginTop: 24,
              animation: 'slide-up-fade 0.28s var(--ease-out) backwards',
              animationDelay: '300ms',
            }}
          >
            <PillButton onClick={() => router.push('/')}>{t('common.goHome')}</PillButton>
          </div>
        </div>
      </div>
    </main>
  )
}

'use client'

import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { GradientTop } from '@/components/ui/gradient-top'
import { PillButton } from '@/components/ui/pill-button'
import { SatelliteGlyph } from '@/components/ui/satellite-glyph'

export default function NotFound() {
  const t = useTranslations()
  const router = useRouter()

  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-[var(--bg)] px-9 text-center">
      <GradientTop height={320} />
      <div
        className="relative z-[1]"
        style={{ animation: 'fresh-start-orb 0.6s var(--ease-out) both' }}
      >
        <SatelliteGlyph size={104} />
      </div>
      <h1
        className="relative z-[1]"
        style={{
          margin: '18px 0 0',
          fontFamily: 'var(--font-sans)',
          fontSize: 22,
          fontWeight: 500,
          lineHeight: 1.3,
          color: 'var(--fg-1)',
          animation: 'slide-up-fade 0.28s var(--ease-out) backwards',
          animationDelay: '160ms',
        }}
      >
        {t('notFoundPage.title')}
      </h1>
      <p
        className="relative z-[1]"
        style={{
          margin: '8px 0 0',
          maxWidth: 300,
          fontFamily: 'var(--font-sans)',
          fontSize: 15,
          lineHeight: 1.5,
          color: 'var(--fg-2)',
          animation: 'slide-up-fade 0.28s var(--ease-out) backwards',
          animationDelay: '220ms',
        }}
      >
        {t('notFoundPage.description')}
      </p>
      <div
        className="relative z-[1]"
        style={{
          marginTop: 24,
          animation: 'slide-up-fade 0.28s var(--ease-out) backwards',
          animationDelay: '300ms',
        }}
      >
        <PillButton onClick={() => router.push('/')}>{t('notFoundPage.home')}</PillButton>
      </div>
    </main>
  )
}

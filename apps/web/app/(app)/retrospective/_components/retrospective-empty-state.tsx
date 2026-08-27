'use client'

import { AstraGlyph } from '@/components/ui/astra-glyph'
import { useTranslations } from 'next-intl'
import { InfoCard } from '@/components/ui/info-card'
import { PillButton } from '@/components/ui/pill-button'

export function RetrospectiveEmptyState({
  isOnline,
  onGenerate,
}: Readonly<{ isOnline: boolean; onGenerate: () => void }>) {
  const t = useTranslations()

  return (
    <div style={{ padding: '20px 0 0' }}>
      <div className="px-5">
        <InfoCard icon={<AstraGlyph size={24} />}>
          <strong className="block text-[var(--fg-1)]">{t('retrospective.astraEyebrow')}</strong>
          <p className="mt-1 text-sm text-[var(--fg-2)]">{t('retrospective.empty')}</p>
        </InfoCard>
      </div>
      <div className="md:mx-auto md:max-w-[360px]" style={{ padding: '18px 20px 24px' }}>
        <PillButton
          onClick={onGenerate}
          disabled={!isOnline}


        >
          {t('retrospective.generate')}
        </PillButton>
      </div>
    </div>
  )
}

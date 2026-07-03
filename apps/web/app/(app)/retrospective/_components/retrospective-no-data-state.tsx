'use client'

import { Orbit } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { InfoCard } from '@/components/ui/info-card'
import { PillButton } from '@/components/ui/pill-button'

export function RetrospectiveNoDataState({
  isOnline,
  onGenerate,
}: Readonly<{ isOnline: boolean; onGenerate: () => void }>) {
  const t = useTranslations()

  return (
    <div style={{ padding: '20px 0 0' }}>
      <div className="px-5">
        <InfoCard
          icon={Orbit}
          title={t('retrospective.astraEyebrow')}
          desc={t('retrospective.noData')}
        />
      </div>
      <div className="md:mx-auto md:max-w-[360px]" style={{ padding: '18px 20px 24px' }}>
        <PillButton
          onClick={onGenerate}
          disabled={!isOnline}
          fullWidth
          leading={<Orbit size={16} strokeWidth={1.8} aria-hidden="true" />}
        >
          {t('retrospective.regenerate')}
        </PillButton>
      </div>
    </div>
  )
}

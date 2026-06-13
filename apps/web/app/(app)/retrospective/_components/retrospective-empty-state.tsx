'use client'

import { Orbit } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { InfoCard } from '@/components/ui/info-card'
import { PillButton } from '@/components/ui/pill-button'
import { OfflineUnavailableState } from '@/components/ui/offline-unavailable-state'

export function RetrospectiveEmptyState({
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
          desc={t('retrospective.empty')}
        />
      </div>
      {!isOnline && (
        <div style={{ padding: '14px 20px 0' }}>
          <OfflineUnavailableState
            title={t('offline.title')}
            description={t('offline.description')}
            compact
          />
        </div>
      )}
      <div style={{ padding: '18px 20px 24px' }}>
        <PillButton
          onClick={onGenerate}
          disabled={!isOnline}
          fullWidth
          leading={<Orbit size={16} strokeWidth={1.8} aria-hidden="true" />}
        >
          {t('retrospective.generate')}
        </PillButton>
      </div>
    </div>
  )
}

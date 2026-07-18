'use client'

import { useTranslations } from 'next-intl'
import { EmptyState } from '@/components/ui/empty-state'
import { Lock } from '@/components/ui/icons'
import { useTopbarHeading } from '@/components/shell/topbar-slot'

/** Route-level Pro gate shown on the Insights surface when the user lacks Pro access. */
export function InsightsLockedState() {
  const t = useTranslations()
  useTopbarHeading({ ownedByPage: true })

  return (
    <EmptyState
      className="min-h-[70dvh] justify-center"
      icon={Lock}
      title={t('insights.lockedTitle')}
      description={t('insights.lockedDescription')}
      action={{ label: t('upgrade.title'), href: '/upgrade' }}
    />
  )
}

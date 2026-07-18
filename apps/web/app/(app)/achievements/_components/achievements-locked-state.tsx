'use client'

import { useTranslations } from 'next-intl'
import { EmptyState } from '@/components/ui/empty-state'
import { Lock } from '@/components/ui/icons'

export function AchievementsLockedState() {
  const t = useTranslations()

  return (
    <EmptyState
      icon={Lock}
      title={t('gamification.page.lockedTitle')}
      description={t('gamification.page.lockedDescription')}
      action={{ label: t('gamification.page.upgradeButton'), href: '/upgrade' }}
    />
  )
}

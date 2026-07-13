'use client'

import { useTranslations } from 'next-intl'
import { PillButton } from '@/components/ui/pill-button'

interface ChallengesTopbarHeadingProps {
  onCreate: () => void
  onJoin: () => void
}

export function ChallengesTopbarHeading({
  onCreate,
  onJoin,
}: Readonly<ChallengesTopbarHeadingProps>) {
  const t = useTranslations()

  return (
    <div className="flex min-w-0 flex-1 items-center justify-between" style={{ gap: 12 }}>
      <h1 className="t-h2 truncate">{t('challenges.title')}</h1>
      <div className="flex shrink-0 items-center" style={{ gap: 8 }}>
        <PillButton onClick={onCreate}>{t('challenges.actions.create')}</PillButton>
        <PillButton variant="ghost" onClick={onJoin}>
          {t('challenges.actions.join')}
        </PillButton>
      </div>
    </div>
  )
}

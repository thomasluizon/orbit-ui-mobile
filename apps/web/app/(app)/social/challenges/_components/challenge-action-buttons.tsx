'use client'

import { useTranslations } from 'next-intl'
import { PillButton } from '@/components/ui/pill-button'

interface ChallengeActionButtonsProps {
  onCreate: () => void
  onJoin: () => void
}

/** The create + join challenge pill CTAs, shared by the list body and the desktop topbar. */
export function ChallengeActionButtons({
  onCreate,
  onJoin,
}: Readonly<ChallengeActionButtonsProps>) {
  const t = useTranslations()

  return (
    <>
      <PillButton onClick={onCreate}>{t('challenges.actions.create')}</PillButton>
      <PillButton variant="ghost" onClick={onJoin}>
        {t('challenges.actions.join')}
      </PillButton>
    </>
  )
}

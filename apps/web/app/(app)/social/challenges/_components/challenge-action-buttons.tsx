'use client'

import { useTranslations } from 'next-intl'
import type { ButtonSize } from '@orbit/shared/theme'
import { PillButton } from '@/components/ui/pill-button'

interface ChallengeActionButtonsProps {
  onCreate: () => void
  onJoin: () => void
  size?: ButtonSize
}

/** The create + join challenge pill CTAs, shared by the list body and the desktop topbar
 *  (which passes `size="sm"` — the topbar's title shares the row and needs the room). */
export function ChallengeActionButtons({
  onCreate,
  onJoin,
  size,
}: Readonly<ChallengeActionButtonsProps>) {
  const t = useTranslations()

  return (
    <>
      <PillButton size={size} onClick={onCreate}>
        {t('challenges.actions.create')}
      </PillButton>
      <PillButton size={size} variant="ghost" onClick={onJoin}>
        {t('challenges.actions.join')}
      </PillButton>
    </>
  )
}

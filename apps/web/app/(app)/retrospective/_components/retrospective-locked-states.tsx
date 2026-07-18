'use client'

import { useTranslations } from 'next-intl'
import { PillButton } from '@/components/ui/pill-button'
import { LockedBlock } from './locked-block'

interface RetrospectiveLockedStatesProps {
  hasProAccess: boolean
  isYearlyPro: boolean
  isTrialActive: boolean
  portalError: string
  onOpenPortal: () => void
}

export function RetrospectiveLockedStates({
  hasProAccess,
  isYearlyPro,
  isTrialActive,
  portalError,
  onOpenPortal,
}: Readonly<RetrospectiveLockedStatesProps>) {
  const t = useTranslations()

  if (!hasProAccess) return null

  if (!isYearlyPro) {
    return (
      <LockedBlock
        title={t('retrospective.lockedYearly')}
        hint={t('retrospective.lockedYearlyHint')}
      >
        {isTrialActive ? (
          <PillButton href="/upgrade" variant="primary" size="md">
            {t('upgrade.subscribe')}
          </PillButton>
        ) : (
          <PillButton onClick={onOpenPortal}>
            {t('retrospective.changePlan')}
          </PillButton>
        )}
        {portalError && (
          <p
            style={{
              marginTop: 12,
              fontFamily: 'var(--font-sans)',
              fontSize: 13,
              color: 'var(--status-bad)',
            }}
          >
            {portalError}
          </p>
        )}
      </LockedBlock>
    )
  }

  return null
}

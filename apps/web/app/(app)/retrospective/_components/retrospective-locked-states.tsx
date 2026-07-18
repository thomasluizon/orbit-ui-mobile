'use client'

import { useTranslations } from 'next-intl'
import { EmptyState } from '@/components/ui/empty-state'
import { Lock } from '@/components/ui/icons'

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

  if (!hasProAccess || isYearlyPro) return null

  const action = isTrialActive
    ? { label: t('upgrade.subscribe'), href: '/upgrade' }
    : { label: t('retrospective.changePlan'), onClick: onOpenPortal }

  return (
    <EmptyState
      icon={Lock}
      title={t('retrospective.lockedYearly')}
      description={t('retrospective.lockedYearlyHint')}
      action={action}
      footer={
        portalError ? (
          <p className="t-secondary" style={{ color: 'var(--status-bad)', maxWidth: '46ch' }}>
            {portalError}
          </p>
        ) : null
      }
    />
  )
}

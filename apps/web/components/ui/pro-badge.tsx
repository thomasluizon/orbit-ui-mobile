'use client'

import { useTranslations } from 'next-intl'
import { Badge } from '@/components/ui/badge'
import { useProfile } from '@/hooks/use-profile'

interface ProBadgeProps {
  /**
   * When true, the badge is always rendered regardless of the user's pro/trial status.
   * Use this for UI labels that should always show the PRO badge (e.g. locked feature headers).
   */
  alwaysVisible?: boolean
  /** Additional classes applied to the outer badge element. */
  className?: string
  /** Override the badge label. Defaults to the i18n trial/pro label. */
  label?: string
}

export function ProBadge({ alwaysVisible = false, className, label }: Readonly<ProBadgeProps>) {
  const t = useTranslations()
  const { profile } = useProfile()

  const isTrialActive = profile?.isTrialActive ?? false
  const hasProAccess = profile?.hasProAccess ?? false

  const shouldRender = alwaysVisible || isTrialActive || hasProAccess
  if (!shouldRender) return null

  const badgeLabel = label ?? (isTrialActive ? t('trial.proBadge') : t('common.proBadge'))

  return <Badge className={className}>{badgeLabel}</Badge>
}

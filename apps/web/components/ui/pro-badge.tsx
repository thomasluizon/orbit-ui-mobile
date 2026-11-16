'use client'

import { useTranslations } from 'next-intl'
import { Badge } from '@/components/ui/badge'
import { useProfile } from '@/hooks/use-profile'

interface ProBadgeProps {
  variant?: 'solid' | 'outline'
  alwaysVisible?: boolean
  className?: string
  label?: string
}

export function ProBadge({ alwaysVisible = false, className, label, variant = 'solid' }: Readonly<ProBadgeProps>) {
  const t = useTranslations()
  const { profile } = useProfile()

  const isTrialActive = profile?.isTrialActive ?? false
  const hasProAccess = profile?.hasProAccess ?? false

  const shouldRender = alwaysVisible || isTrialActive || hasProAccess
  if (!shouldRender) return null

  const badgeLabel = label ?? (isTrialActive ? t('trial.proBadge') : t('common.proBadge'))

  const badge = <Badge variant={variant}>{badgeLabel}</Badge>

  return className ? <span className={className}>{badge}</span> : badge
}

'use client'

import { useTranslations } from 'next-intl'
import { Badge } from '@/components/ui/badge'
import { useProfile } from '@/hooks/use-profile'

export function ProBadge() {
  const t = useTranslations()
  const { profile } = useProfile()

  const isTrialActive = profile?.isTrialActive ?? false
  const hasProAccess = profile?.hasProAccess ?? false

  if (!isTrialActive && !hasProAccess) return null

  return <Badge>{isTrialActive ? t('trial.proBadge') : t('common.proBadge')}</Badge>
}

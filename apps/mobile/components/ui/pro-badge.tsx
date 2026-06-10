import type { StyleProp, ViewStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/ui/badge'
import { useProfile } from '@/hooks/use-profile'

interface ProBadgeProps {
  /**
   * When true, the badge is always rendered regardless of the user's pro/trial status.
   * Use this for UI labels that should always show the PRO badge (e.g. locked feature headers).
   */
  alwaysVisible?: boolean
  /** Additional styles applied to the outer badge container. */
  style?: StyleProp<ViewStyle>
  /** Override the badge label. Defaults to the i18n trial/pro label. */
  label?: string
}

export function ProBadge({ alwaysVisible = false, style, label }: Readonly<ProBadgeProps>) {
  const { t } = useTranslation()
  const { profile } = useProfile()

  const isTrialActive = profile?.isTrialActive ?? false
  const hasProAccess = profile?.hasProAccess ?? false

  const shouldRender = alwaysVisible || isTrialActive || hasProAccess
  if (!shouldRender) return null

  const badgeLabel = label ?? (isTrialActive ? t('trial.proBadge') : t('common.proBadge'))

  return <Badge style={style}>{badgeLabel}</Badge>
}

import { View, type StyleProp, type ViewStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/ui/badge'
import { useProfile } from '@/hooks/use-profile'

interface ProBadgeProps {
  variant?: 'solid' | 'outline'
  alwaysVisible?: boolean
  style?: StyleProp<ViewStyle>
  label?: string
}

export function ProBadge({ alwaysVisible = false, style, label, variant = 'solid' }: Readonly<ProBadgeProps>) {
  const { t } = useTranslation()
  const { profile } = useProfile()

  const isTrialActive = profile?.isTrialActive ?? false
  const hasProAccess = profile?.hasProAccess ?? false

  const shouldRender = alwaysVisible || isTrialActive || hasProAccess
  if (!shouldRender) return null

  const badgeLabel = label ?? (isTrialActive ? t('trial.proBadge') : t('common.proBadge'))

  const badge = <Badge variant={variant}>{badgeLabel}</Badge>

  return style ? <View style={style}>{badge}</View> : badge
}

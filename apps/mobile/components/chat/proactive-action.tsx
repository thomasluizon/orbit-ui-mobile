import { Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useAppTheme } from '@/lib/use-app-theme'
import { createTokensV2 } from '@/lib/theme'
import type { ProactiveItem } from '@orbit/shared/types'
import { proactiveActionLabelKey } from '@orbit/shared/utils'
import { useProactiveAction } from '@/hooks/use-proactive-action'
import { Button } from '@/components/ui/pill-button'

export function ProactiveAction({ item, acted, isOnline, onSend }: Readonly<{
  item: ProactiveItem
  acted: boolean
  isOnline: boolean
  onSend: (prompt: string) => Promise<void>
}>) {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const { reason, allowance, act } = useProactiveAction(item, acted, isOnline, onSend)
  const label = item.actionLabel || t(proactiveActionLabelKey(item.trigger))
  const explanation = reason ? t(reason, { allowance }) : undefined
  return <View style={{ alignItems: 'flex-start', gap: explanation ? 8 : 0, paddingVertical: 8 }}>
    <Button variant="ghost" disabled={reason !== null} hint={explanation} onClick={act}>{label}</Button>
    <Text accessibilityLiveRegion="polite" style={{ color: tokens.fg2, fontSize: 14, lineHeight: 14 * 1.55, fontFamily: 'Geist_400Regular' }}>{explanation}</Text>
  </View>
}

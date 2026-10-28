import { Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useAppTheme } from '@/lib/use-app-theme'
import { createTokensV2 } from '@/lib/theme'
import type { ProactiveItem } from '@orbit/shared/types'
import { createAstraAllowanceTranslator, proactiveActionLabelKey } from '@orbit/shared/utils'
import { useProactiveAction } from '@/hooks/use-proactive-action'
import { AstraGlyph } from '@/components/ui/astra-glyph'
import { InsetFocusPressable } from '@/components/ui/inset-focus-pressable'

export function ProactiveAction({ item, acted, isOnline, onSend }: Readonly<{
  item: ProactiveItem
  acted: boolean
  isOnline: boolean
  onSend: (prompt: string) => Promise<void>
}>) {
  const { t, i18n } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const { reason, allowance, act, aiMessagesPeriod } = useProactiveAction(item, acted, isOnline, onSend)
  const allowanceText = createAstraAllowanceTranslator(t, { aiMessagesPeriod }, i18n.language)
  const label = item.actionLabel || t(proactiveActionLabelKey(item.trigger))
  const explanation = reason ? allowanceText(reason, { allowance }) : undefined
  return <View style={{ alignItems: 'flex-start', gap: 8, paddingVertical: 8 }}>
    <InsetFocusPressable accessibilityRole="button" accessibilityLabel={label} accessibilityHint={explanation} disabled={reason !== null} onPress={act} style={({ pressed }) => ({ minHeight: 48, maxWidth: '100%', gap: 8, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 12, overflow: 'hidden', backgroundColor: pressed ? tokens.bgHover : tokens.bgWell, opacity: reason ? 0.5 : 1 })}><Text style={{ color: tokens.fg2, fontSize: 14, lineHeight: 20, fontFamily: 'Geist_400Regular' }}>{label}</Text><View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><AstraGlyph size={16} color={tokens.fg2} /></View></InsetFocusPressable>
    <Text accessibilityLiveRegion="polite" style={[{ color: tokens.fg2, fontSize: 14, lineHeight: 14 * 1.55, fontFamily: 'Geist_400Regular' }, !explanation ? { position: 'absolute', width: 0, height: 0 } : null]}>{explanation}</Text>
  </View>
}

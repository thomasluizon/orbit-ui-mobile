import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Sheet } from '@/components/ui/sheet'
import { View, type TextStyle } from 'react-native'
import { InsetFocusPressable } from '@/components/ui/inset-focus-pressable'
import { ChevronDown } from '@/components/ui/icons'
import { PersonalText } from '@/components/ui/personal-text'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

export function PersonalTextDetails({ children, textStyle, lines = 2, iconOnly = false, proposed = false, outset = false }: Readonly<{ children: string; textStyle?: TextStyle; lines?: 1 | 2; iconOnly?: boolean; proposed?: boolean; outset?: boolean }>) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  const [focused, setFocused] = useState(false)
  const [hovered, setHovered] = useState(false)
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  return <View style={iconOnly ? { minWidth: 48, flexShrink: 0 } : { minWidth: 0, width: '100%' }}>
    <InsetFocusPressable accessibilityRole="button" accessibilityLabel={iconOnly ? t('common.showFullText', { name: children }) : children} accessibilityState={{ expanded }} onPress={() => setExpanded(!expanded)} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} onHoverIn={() => setHovered(true)} onHoverOut={() => setHovered(false)} style={({ pressed }) => ({ minHeight: 48, minWidth: 0, marginHorizontal: outset && !iconOnly ? -8 : 0, paddingHorizontal: 8, paddingVertical: 4, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: lines === 1 ? 8 : 12, overflow: 'hidden', backgroundColor: pressed || focused || hovered ? tokens.bgHover : 'transparent' })}>
      {({ pressed }) => <>{!iconOnly ? <View style={{ flex: 1, minWidth: 0 }}><PersonalText lines={lines} expanded={expanded} style={{ color: proposed ? pressed || focused || hovered ? tokens.fg2 : tokens.fg3 : tokens.fg1, fontSize: 14, lineHeight: 19.6, fontFamily: 'Geist_500Medium', ...textStyle }}>{children}</PersonalText></View> : null}
      <ChevronDown accessible={false} color={tokens.fg2} size={20} strokeWidth={2} style={expanded ? { transform: [{ rotate: '180deg' }] } : undefined} /></>}
    </InsetFocusPressable>
    {iconOnly && expanded ? <Sheet title={children} titleMode="typed" onClose={() => setExpanded(false)}><PersonalText expanded style={{ color: tokens.fg1, fontSize: 14, lineHeight: 19.6, fontFamily: 'Geist_400Regular' }}>{children}</PersonalText></Sheet> : null}
  </View>
}

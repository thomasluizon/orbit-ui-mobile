import { useState } from 'react'
import { Sheet } from '@/components/ui/sheet'
import { View } from 'react-native'
import { InsetFocusPressable } from '@/components/ui/inset-focus-pressable'
import { ChevronDown } from '@/components/ui/icons'
import { PersonalText } from '@/components/ui/personal-text'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

export function PersonalTextDetails({ children, iconOnly = false }: Readonly<{ children: string; iconOnly?: boolean }>) {
  const [expanded, setExpanded] = useState(false)
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  return <View style={iconOnly ? { minWidth: 48, flexShrink: 0 } : { minWidth: 0, width: '100%' }}>
    <InsetFocusPressable accessibilityRole="button" accessibilityLabel={children} accessibilityState={{ expanded }} onPress={() => setExpanded(!expanded)} style={({ pressed }) => ({ minHeight: 48, minWidth: 0, paddingHorizontal: 8, paddingVertical: 4, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, overflow: 'hidden', backgroundColor: pressed ? tokens.bgHover : 'transparent' })}>
      {!iconOnly ? <View style={{ flex: 1, minWidth: 0 }}><PersonalText expanded={expanded} style={{ color: tokens.fg1, fontSize: 14, fontFamily: 'Geist_500Medium' }}>{children}</PersonalText></View> : null}
      <ChevronDown accessible={false} color={tokens.fg2} size={20} strokeWidth={1.5} style={expanded ? { transform: [{ rotate: '180deg' }] } : undefined} />
    </InsetFocusPressable>
    {iconOnly && expanded ? <Sheet title={children} titleMode="typed" onClose={() => setExpanded(false)}><PersonalText expanded style={{ color: tokens.fg1, fontSize: 14, fontFamily: 'Geist_400Regular' }}>{children}</PersonalText></Sheet> : null}
  </View>
}

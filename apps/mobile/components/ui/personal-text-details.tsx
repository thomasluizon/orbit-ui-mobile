import { SPACING } from '@orbit/shared/theme'
import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Sheet } from '@/components/ui/sheet'
import { View, type TextStyle } from 'react-native'
import { InsetFocusPressable } from '@/components/ui/inset-focus-pressable'
import { ChevronDown } from '@/components/ui/icons'
import { PersonalText } from '@/components/ui/personal-text'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

export function PersonalTextDetails({ children, textStyle, lines = 2, iconOnly = false, proposed = false, outset = false, clamped: labelClamped = false }: Readonly<{ children: string; textStyle?: TextStyle; lines?: 1 | 2; iconOnly?: boolean; proposed?: boolean; outset?: boolean; clamped?: boolean }>) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  const [clamped, setClamped] = useState(false)
  const [text, setText] = useState(children)
  if (text !== children) {
    setText(children)
    setClamped(false)
    setExpanded(false)
  }
  const measureClamped = useCallback((next: boolean) => {
    setClamped(next)
    if (!next) setExpanded(false)
  }, [])
  const canDisclose = iconOnly ? labelClamped : clamped
  const [focused, setFocused] = useState(false)
  const [hovered, setHovered] = useState(false)
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const content = (interactive: boolean) => {
    const color = proposed ? interactive ? tokens.fg2 : tokens.fg3 : tokens.fg1
    const style = { color, fontSize: 14, lineHeight: 19.6, fontFamily: 'Geist_500Medium', ...textStyle }
    return <>
    {!iconOnly ? <View style={{ flex: 1, minWidth: 0 }}>
      <View accessibilityElementsHidden={expanded} importantForAccessibility={expanded ? 'no-hide-descendants' : 'auto'} style={expanded ? { position: 'absolute', width: '100%', opacity: 0, pointerEvents: 'none' } : undefined}>
        <PersonalText lines={lines} onClampedChange={measureClamped} style={style}>{children}</PersonalText>
      </View>
      {expanded ? <PersonalText expanded style={style}>{children}</PersonalText> : null}
    </View> : null}
    {canDisclose ? <ChevronDown accessible={false} color={tokens.fg2} size={20} strokeWidth={2} style={expanded ? { transform: [{ rotate: '180deg' }] } : undefined} /> : null}
  </>
  }
  const rowStyle = { minHeight: 48, minWidth: 0, marginHorizontal: outset && !iconOnly ? -SPACING.s8 : SPACING.s0, paddingHorizontal: SPACING.s8, paddingVertical: SPACING.s4, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: lines === 1 ? 8 : 12 } as const
  if (iconOnly && !canDisclose && !expanded) return null
  return <View style={iconOnly ? { minWidth: 48, flexShrink: 0 } : { minWidth: 0, width: '100%' }}>
    {canDisclose ? <InsetFocusPressable accessibilityRole="button" accessibilityLabel={iconOnly ? t('common.showFullText', { name: children }) : children} accessibilityState={{ expanded }} onPress={() => setExpanded(!expanded)} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} onHoverIn={() => setHovered(true)} onHoverOut={() => setHovered(false)} style={({ pressed }) => ({ ...rowStyle, overflow: 'hidden', backgroundColor: pressed || focused || hovered ? tokens.bgHover : 'transparent' })}>
      {({ pressed }) => content(pressed || focused || hovered)}
    </InsetFocusPressable> : <View style={rowStyle}>{content(false)}</View>}
    {iconOnly && expanded ? <Sheet title={children} titleMode="typed" onClose={() => setExpanded(false)}><PersonalText expanded style={{ color: tokens.fg1, fontSize: 14, lineHeight: 19.6, fontFamily: 'Geist_400Regular' }}>{children}</PersonalText></Sheet> : null}
  </View>
}

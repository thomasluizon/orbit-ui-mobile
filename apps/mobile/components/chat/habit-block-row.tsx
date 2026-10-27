import { useState, type ReactNode } from 'react'
import { View, Text } from 'react-native'
import { HabitRowLeading } from '@/components/habits/habit-row-leading'
import { PersonalText } from '@/components/ui/personal-text'
import { InsetFocusPressable } from '@/components/ui/inset-focus-pressable'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

export function HabitBlockRow({ title, emoji, meta, reason, error, label, onOpen, disabled = false, control, expanded, proposed = false }: Readonly<{
  title: string
  emoji?: string | null
  proposed?: boolean
  expanded?: boolean
  meta?: string
  reason?: string
  error?: string
  label?: string
  onOpen?: () => void
  disabled?: boolean
  control?: ReactNode
}>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const [disclosed, setDisclosed] = useState(false)
  const open = onOpen ?? (() => setDisclosed(!disclosed))
  const shownExpanded = onOpen ? expanded : disclosed
  let titleColor = tokens.fg1
  if (proposed) titleColor = tokens.fg2
  const content = <><HabitRowLeading habitTitle={title} emoji={emoji ?? null} emojiSize={22} wellSize={46} wellRadius={16} tokens={tokens} monogramColor={tokens.fg3} />
    <View style={{ flex: 1, minWidth: 0, gap: 4 }}><PersonalText expanded={shownExpanded} style={{ fontSize: 16, fontFamily: 'Geist_500Medium', color: titleColor }}>{title}</PersonalText>
    {error ? <Text accessibilityRole="alert" style={{ fontSize: 12, color: tokens.statusBadText }}>{error}</Text> : null}
    {meta ? <Text style={{ fontSize: 12, lineHeight: 18, color: tokens.fg2 }}>{meta}</Text> : null}
    {reason ? <Text numberOfLines={1} accessibilityLabel={reason} style={{ fontSize: 12, lineHeight: 18, color: tokens.fg2 }}>{reason}</Text> : null}</View></>
  return <View data-slot="list-row-body" testID="habit-block-row" style={{ minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 20, backgroundColor: tokens.bgCard, padding: 8 }}>
     <InsetFocusPressable accessibilityRole="button" accessibilityLabel={label ?? title} accessibilityState={{ disabled, expanded: shownExpanded }} disabled={disabled} onPress={open} style={({ pressed }) => ({ minHeight: 48, minWidth: 0, flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, overflow: 'hidden', backgroundColor: pressed ? tokens.bgHover : 'transparent', opacity: disabled ? 0.6 : 1 })}>{content}</InsetFocusPressable>
    {control ? <View style={{ flexShrink: 0, alignItems: 'center' }}>{control}</View> : null}
  </View>
}

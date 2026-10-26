import type { ReactNode } from 'react'
import { View, Text } from 'react-native'
import { HabitRowLeading } from '@/components/habits/habit-row-leading'
import { PersonalText } from '@/components/ui/personal-text'
import { InsetFocusPressable } from '@/components/ui/inset-focus-pressable'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

export function HabitBlockRow({ title, emoji, meta, label, onOpen, disabled = false, control, expanded }: Readonly<{
  title: string
  emoji?: string | null
  expanded?: boolean
  meta?: string
  label?: string
  onOpen?: () => void
  disabled?: boolean
  control?: ReactNode
}>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const content = <><HabitRowLeading habitTitle={title} emoji={emoji ?? null} emojiSize={22} wellSize={46} wellRadius={16} tokens={tokens} monogramColor={tokens.fg3} /><View style={{ flex: 1, minWidth: 0, gap: 4 }}><PersonalText expanded={expanded} style={{ fontSize: 16, fontFamily: 'Geist_500Medium', color: tokens.fg1 }}>{title}</PersonalText>{meta ? <Text style={{ fontSize: 12, color: tokens.fg3 }}>{meta}</Text> : null}</View></>
  return <View testID="habit-block-row" style={{ minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 20, backgroundColor: tokens.bgCard, padding: 8 }}>
    {onOpen ? <InsetFocusPressable accessibilityRole="button" accessibilityLabel={label ?? title} disabled={disabled} onPress={onOpen} style={({ pressed }) => ({ minHeight: 48, minWidth: 0, flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, backgroundColor: pressed ? tokens.bgHover : 'transparent', opacity: disabled ? 0.6 : 1 })}>{content}</InsetFocusPressable> : <View style={{ minHeight: 48, minWidth: 0, flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>{content}</View>}
    {control ? <View style={{ flexShrink: 0, alignItems: 'center' }}>{control}</View> : null}
  </View>
}

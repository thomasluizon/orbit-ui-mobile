import { useState, type ReactNode } from 'react'
import { View, Text } from 'react-native'
import { HabitRowLeading } from '@/components/habits/habit-row-leading'
import { PersonalText } from '@/components/ui/personal-text'
import { InsetFocusPressable } from '@/components/ui/inset-focus-pressable'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

export function HabitBlockRow({ title, emoji, meta, error, label, onOpen, disabled = false, control, expanded, proposed = false }: Readonly<{
  title: string
  emoji?: string | null
  proposed?: boolean
  expanded?: boolean
  meta?: string
  error?: string
  label?: string
  onOpen?: () => void
  disabled?: boolean
  control?: ReactNode
}>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const [interacting, setInteracting] = useState(false)
  const [disclosed, setDisclosed] = useState(false)
  const open = onOpen ?? (() => setDisclosed(!disclosed))
  const shownExpanded = onOpen ? expanded : disclosed
  const content = <><HabitRowLeading habitTitle={title} emoji={emoji ?? null} emojiSize={22} wellSize={46} wellRadius={16} tokens={tokens} monogramColor={tokens.fg3} /><View style={{ flex: 1, minWidth: 0, gap: 4 }}><PersonalText expanded={shownExpanded} style={{ fontSize: 16, fontFamily: 'Geist_500Medium', color: proposed ? interacting ? tokens.fg2 : tokens.fg3 : tokens.fg1 }}>{title}</PersonalText>{error ? <Text accessibilityRole="alert" style={{ fontSize: 12, color: tokens.statusBadText }}>{error}</Text> : null}{meta ? <Text style={{ fontSize: 12, lineHeight: 18, color: proposed && interacting ? tokens.fg2 : tokens.fg3 }}>{meta}</Text> : null}</View></>
  return <View data-slot="list-row-body" testID="habit-block-row" style={{ minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 20, backgroundColor: tokens.bgCard, padding: 8 }}>
     <InsetFocusPressable accessibilityRole="button" accessibilityLabel={label ?? title} accessibilityState={{ disabled, expanded: shownExpanded }} disabled={disabled} onPress={open} onHoverIn={() => setInteracting(true)} onHoverOut={() => setInteracting(false)} onPressIn={() => setInteracting(true)} onPressOut={() => setInteracting(false)} onFocus={() => setInteracting(true)} onBlur={() => setInteracting(false)} style={({ pressed }) => ({ minHeight: 48, minWidth: 0, flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, overflow: 'hidden', backgroundColor: pressed ? tokens.bgHover : 'transparent', opacity: disabled ? 0.6 : 1 })}>{content}</InsetFocusPressable>
    {control ? <View style={{ flexShrink: 0, alignItems: 'center' }}>{control}</View> : null}
  </View>
}

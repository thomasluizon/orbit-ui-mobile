import type { ReactNode } from 'react'
import { useMemo, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import { useTranslation } from 'react-i18next'
import { promptExampleParts } from '@orbit/shared/chat/prompt-library'
import { buildCatalogIdea, type CatalogIdeaProps, type PromptIdeaProps } from '@orbit/shared/chat/prompt-library-core'
import { PADDING, TOUCH_TARGET_MIN } from '@orbit/shared/theme'
import { InsetFocusPressable } from '@/components/ui/inset-focus-pressable'
import { Sun, Moon, Plus, Target, Bell, ListTree, Clock, List, ArrowsMove, SkipForward, CheckCheck, Tag, CalendarDays, RotateCcw, Minus, CircleDot, ChartLine, Repeat, Snowflake, CalendarClock, Download, Calendar } from '@/components/ui/icons'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

const intentIcons = { Sun, Moon, Plus, Target, Bell, ListTree, Clock, List, ArrowsMove, SkipForward, CheckCheck, Tag, CalendarDays, RotateCcw, Minus, CircleDot, ChartLine, Repeat, Snowflake, CalendarClock, Download, Calendar }

export function PromptIdea({ label, icon, example, catalogId, disabled, onSelect }: Readonly<PromptIdeaProps<ReactNode>>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const [focused, setFocused] = useState(false)
  const [hovered, setHovered] = useState(false)
  const hoverGesture = useMemo(() => Gesture.Hover()
    .manualActivation(true)
    .cancelsTouchesInView(false)
    .runOnJS(true)
    .enabled(!disabled)
    .onBegin(() => setHovered(!disabled))
    .onFinalize(() => setHovered(false)), [disabled])
  if (disabled && hovered) setHovered(false)
  const accessibilityHint = example || undefined
  return <GestureDetector gesture={hoverGesture}><InsetFocusPressable accessibilityRole="button" accessibilityLabel={label} accessibilityHint={accessibilityHint} accessibilityState={{ disabled }} disabled={disabled}
    testID={catalogId ? `prompt-idea:${catalogId}` : 'prompt-live-idea'} onPress={() => { if (!disabled) onSelect() }} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
    style={({ pressed }) => [styles.action, { backgroundColor: !disabled && (pressed || hovered || focused) ? tokens.bgHover : tokens.bgCard, opacity: disabled ? 0.5 : 1 }]}>
    <View style={styles.content}>
      {icon ? <View testID="prompt-intent" accessible={false} importantForAccessibility="no-hide-descendants" style={styles.icon}>{icon}</View> : null}
      <View style={styles.text}>
        <Text data-slot="prompt-idea-title" style={[styles.title, { color: tokens.fg1 }]}>{label}</Text>
        {example ? <Text testID="prompt-example" style={[styles.example, { color: tokens.fg2 }]}>{promptExampleParts(example).map((part, index) => <Text key={index} testID={part.slot ? 'prompt-slot' : undefined} style={part.slot ? { fontFamily: 'Geist_500Medium' } : undefined}>{part.text}</Text>)}</Text> : null}
      </View>
    </View>
  </InsetFocusPressable></GestureDetector>
}

export function CatalogIdea({ template, disabled, onSelect }: Readonly<CatalogIdeaProps>) {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const { intentIcon, ...idea } = buildCatalogIdea(template, t, onSelect)
  const Icon = intentIcons[intentIcon]
  return <PromptIdea {...idea} icon={<Icon size={24} strokeWidth={1.5} color={tokens.fg1} />} disabled={disabled} />
}

const styles = StyleSheet.create({
  action: { minHeight: TOUCH_TARGET_MIN, minWidth: 0, padding: PADDING.recordInset, borderRadius: 20, overflow: 'hidden', gap: 12 },
  content: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, minWidth: 0 },
  icon: { width: 24, minHeight: 24, flexShrink: 0 },
  text: { flex: 1, minWidth: 0, gap: 4 },
  title: { fontFamily: 'Geist_400Regular', fontSize: 17, lineHeight: 23.8 },
  example: { fontFamily: 'Geist_400Regular', fontSize: 14, lineHeight: 21.7, letterSpacing: 0.07 },
})

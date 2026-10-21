import type { ReactNode } from 'react'
import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { findPromptSlot } from '@orbit/shared/chat/composer-controls'
import { PROMPT_PRESENTATION, promptExampleParts, type PromptTemplate } from '@orbit/shared/chat/prompt-library'
import { PADDING, TOUCH_TARGET_MIN } from '@orbit/shared/theme'
import { InsetFocusPressable } from '@/components/ui/inset-focus-pressable'
import { AstraGlyph } from '@/components/ui/astra-glyph'
import { Lightbulb, Sun, Moon, Plus, Target, Bell, ListTree, Clock, List, ArrowsMove, SkipForward, CheckCheck, Tag, CalendarDays, RotateCcw, Minus, CircleDot, ChartLine, Repeat, Snowflake, CalendarClock, Download, Calendar } from '@/components/ui/icons'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

const intentIcons = { Sun, Moon, Plus, Target, Bell, ListTree, Clock, List, ArrowsMove, SkipForward, CheckCheck, Tag, CalendarDays, RotateCcw, Minus, CircleDot, ChartLine, Repeat, Snowflake, CalendarClock, Download, Calendar }

type PromptIdeaProps = {
  label: string
  icon?: ReactNode
  example?: string
  invokesAstra?: boolean
  catalogId?: string
  disabled: boolean
  onSelect: () => void
}

export function PromptIdea({ label, icon, example, invokesAstra = true, catalogId, disabled, onSelect }: Readonly<PromptIdeaProps>) {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const [focused, setFocused] = useState(false)
  const [hovered, setHovered] = useState(false)
  const accessibilityHint = [example, invokesAstra ? t('chat.title') : undefined].filter(Boolean).join(' ') || undefined
  return <InsetFocusPressable accessibilityRole="button" accessibilityLabel={label} accessibilityHint={accessibilityHint} accessibilityState={{ disabled }} disabled={disabled}
    testID={catalogId ? `prompt-idea:${catalogId}` : 'prompt-live-idea'} onPress={() => { if (!disabled) onSelect() }} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} onHoverIn={() => setHovered(true)} onHoverOut={() => setHovered(false)}
    style={({ pressed }) => [styles.action, { backgroundColor: !disabled && (pressed || hovered || focused) ? tokens.bgHover : catalogId ? tokens.bgCard : 'transparent', opacity: disabled ? 0.5 : 1 }]}>
    <View style={styles.content}>
      <View testID="prompt-intent" accessible={false} importantForAccessibility="no-hide-descendants" style={styles.icon}>{icon ?? <Lightbulb size={24} strokeWidth={1.5} color={tokens.fg1} />}</View>
      <View style={styles.text}>
        <Text data-slot="prompt-idea-title" style={[styles.title, { color: tokens.fg1 }]}>{label}</Text>
        {example ? <Text testID="prompt-example" style={[styles.example, { color: tokens.fg2 }]}>{promptExampleParts(example).map((part, index) => <Text key={index} testID={part.slot ? 'prompt-slot' : undefined} style={part.slot ? { fontFamily: 'Geist_500Medium' } : undefined}>{part.text}</Text>)}</Text> : null}
      </View>
    </View>
    {invokesAstra ? <View testID="prompt-attribution" style={styles.attribution}><AstraGlyph size={20} color={tokens.fg2} /><Text style={[styles.example, { color: tokens.fg2 }]}>{t('chat.title')}</Text></View> : null}
  </InsetFocusPressable>
}

export function CatalogIdea({ template, disabled, onSelect }: Readonly<{ template: PromptTemplate; disabled: boolean; onSelect: (id: string, label: string, prompt: string) => void }>) {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const presentation = PROMPT_PRESENTATION[template.id]
  const Icon = intentIcons[presentation.icon]
  const label = t(template.labelKey)
  const prompt = t(template.promptKey)
  return <PromptIdea catalogId={template.id} label={label} icon={<Icon size={24} strokeWidth={1.5} color={tokens.fg1} />} example={presentation.example ? prompt : undefined}
    invokesAstra={!findPromptSlot(prompt)} disabled={disabled} onSelect={() => onSelect(template.id, label, prompt)} />
}

const styles = StyleSheet.create({
  action: { minHeight: TOUCH_TARGET_MIN, minWidth: 0, padding: PADDING.recordInset, borderRadius: 20, gap: 12 },
  content: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, minWidth: 0 },
  icon: { width: 24, minHeight: 24, flexShrink: 0 },
  text: { flex: 1, minWidth: 0, gap: 4 },
  title: { fontFamily: 'Geist_400Regular', fontSize: 17, lineHeight: 23.8 },
  example: { fontFamily: 'Geist_400Regular', fontSize: 14, lineHeight: 21.7, letterSpacing: 0.07 },
  attribution: { flexDirection: 'row', alignItems: 'center', gap: 8 },
})

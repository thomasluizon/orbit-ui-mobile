import { StyleSheet, Text, View } from 'react-native'
import { useState } from 'react'
import { INTERACTION_FILL_CLEARANCE, TOUCH_TARGET_MIN } from '@orbit/shared/theme'
import { useTranslation } from 'react-i18next'
import { formatQuestionNumber, type QuestionControlProps } from '@orbit/shared/chat'
import { RadioGroup, RadioItem } from '@/components/ui/radio-group'
import { RadioRow } from '@/components/ui/select-check'
import { InsetFocusPressable } from '@/components/ui/inset-focus-pressable'
import { CheckRow } from '@/components/ui/check-row'
import { Input } from '@/components/ui/input'
import { Slider } from '@/components/ui/slider'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

function QuestionScale({ question, answer, disabled, controller, words }: QuestionControlProps) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const [availableWidth, setAvailableWidth] = useState(0)
  const optionWidth = Math.max(TOUCH_TARGET_MIN, availableWidth / 5)
  if (question.type !== 'scale') return null
  return <View style={{ minWidth: 0, gap: 8 }}>
    <RadioGroup testID="question-scale" accessibilityLabel={question.prompt} accessibilityHint={words.required} onLayout={event => setAvailableWidth(event.nativeEvent.layout.width)} style={{ flexDirection: 'row', gap: 0 }}>
      {[1, 2, 3, 4, 5].map(number => <RadioItem key={number} selected={answer?.number === number} disabled={disabled} onSelect={() => controller.setAnswer(question, { number })}>
        <InsetFocusPressable accessibilityRole="radio" accessibilityLabel={String(number)} accessibilityState={{ checked: answer?.number === number, disabled }} disabled={disabled} focusable={!disabled} focusInset={INTERACTION_FILL_CLEARANCE / 2} focusOffset={-2} focusColor={tokens.primary}
          style={[styles.scaleOption, { width: optionWidth, opacity: disabled ? 0.6 : 1 }]}>
          {({ pressed, focused }) => <View data-slot="question-scale-fill" style={[styles.scaleFill, {
            backgroundColor: pressed || focused ? tokens.bgHover : answer?.number === number ? tokens.bgWell : 'transparent',
            outlineWidth: answer?.number === number && !focused ? 2 : 0, outlineOffset: -2, outlineStyle: 'solid', outlineColor: tokens.primary,
          }]}>
            <Text style={{ color: tokens.fg1, fontSize: 16, lineHeight: 24, fontFamily: 'Geist_400Regular' }}>{number}</Text>
          </View>}
        </InsetFocusPressable>
      </RadioItem>)}
    </RadioGroup>
    <View style={{ flexDirection: 'row', gap: 16 }}><Text style={{ flex: 1, minWidth: 0, fontSize: 14, lineHeight: 20, color: tokens.fg3 }}>{question.lowLabel}</Text><Text style={{ flex: 1, minWidth: 0, fontSize: 14, lineHeight: 20, color: tokens.fg3, textAlign: 'right' }}>{question.highLabel}</Text></View>
  </View>
}

export function QuestionControls(props: QuestionControlProps) {
  const { question, answer, disabled, controller, words } = props
  const { i18n } = useTranslation()
  const numberLabel = (value: number) => formatQuestionNumber(value, i18n.language)
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  if (question.type === 'scale') return <QuestionScale {...props} />
  if (question.type === 'slider') return <View style={{ minWidth: 0, gap: 8 }}>
    <Text style={{ fontSize: 14, lineHeight: 20, color: tokens.fg2 }}>{answer?.number === undefined ? `${numberLabel(question.min)} ${question.unit} / ${numberLabel(question.max)} ${question.unit}` : `${numberLabel(answer.number)} ${question.unit}`}</Text>
    <Slider label={question.prompt} min={question.min} max={question.max} step={question.step} value={answer?.number} valueText={`${numberLabel(answer?.number ?? question.min)} ${question.unit}`} disabled={disabled} onChange={number => controller.setAnswer(question, { number })} />
  </View>
  const choices = question.type === 'yesNo' ? [true, false].map(boolean => ({ id: String(boolean), label: boolean ? words.yes : words.no, recommended: false })) : question.options
  const rows = choices.map(option => question.type === 'multipleChoice'
    ? <CheckRow key={option.id} selection wrapLabel label={option.label} checked={answer?.selectedIds?.includes(option.id) === true} disabled={disabled} onChange={() => controller.select(question, option.id)} />
    : <RadioRow key={option.id} selection wrapLabel hideMeta label={option.label} description={option.recommended ? words.recommended : undefined}
        selected={question.type === 'yesNo' ? answer?.boolean === (option.id === 'true') : answer?.selectedIds?.includes(option.id)}
        onSelect={() => question.type === 'yesNo' ? controller.setAnswer(question, { boolean: option.id === 'true' }) : controller.select(question, option.id)}
        {...(disabled ? { disabled: true as const, reasonScope: 'group' as const } : { disabled: false as const })} />)
  return <View style={{ minWidth: 0, gap: 16 }}>
    {question.type === 'multipleChoice' ? <View role="group" accessibilityLabel={question.prompt}>{rows}</View> : <RadioGroup accessibilityLabel={question.prompt} accessibilityHint={words.required}>{rows}</RadioGroup>}
    {question.allowFreeText ? <Input label={words.freeText} value={answer?.freeText ?? ''} onChange={value => controller.setFreeText(question, value)} disabled={disabled} maxLength={500} /> : null}
  </View>
}

const styles = StyleSheet.create({
  scaleOption: { minWidth: TOUCH_TARGET_MIN, minHeight: TOUCH_TARGET_MIN, padding: INTERACTION_FILL_CLEARANCE / 2, borderRadius: 12 },
  scaleFill: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 8, borderRadius: 12, overflow: 'hidden' },
})

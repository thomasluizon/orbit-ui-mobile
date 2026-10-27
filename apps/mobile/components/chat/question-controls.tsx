import { Text, View } from 'react-native'
import type { QuestionControlProps } from '@orbit/shared/chat'
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
  if (question.type !== 'scale') return null
  return <View style={{ minWidth: 0, gap: 8 }}>
    <RadioGroup accessibilityLabel={question.prompt} accessibilityHint={words.required} style={{ flexDirection: 'row' }}>
      {[1, 2, 3, 4, 5].map(number => <RadioItem key={number} selected={answer?.number === number} disabled={disabled} onSelect={() => controller.setAnswer(question, { number })}>
        <InsetFocusPressable accessibilityRole="radio" accessibilityLabel={String(number)} accessibilityState={{ checked: answer?.number === number, disabled }} disabled={disabled} focusable={!disabled}
          style={({ pressed }) => ({ flex: 1, minWidth: 0, minHeight: 48, alignItems: 'center', justifyContent: 'center', padding: 8, borderRadius: 12, opacity: disabled ? 0.6 : 1, backgroundColor: pressed ? tokens.bgHover : answer?.number === number ? tokens.bgWell : 'transparent' })}>
          <Text style={{ color: tokens.fg1, fontSize: 16, lineHeight: 24, fontFamily: 'Geist_400Regular' }}>{number}</Text>
        </InsetFocusPressable>
      </RadioItem>)}
    </RadioGroup>
    <View style={{ flexDirection: 'row', gap: 16 }}><Text style={{ flex: 1, minWidth: 0, fontSize: 14, lineHeight: 20, color: tokens.fg3 }}>{question.lowLabel}</Text><Text style={{ flex: 1, minWidth: 0, fontSize: 14, lineHeight: 20, color: tokens.fg3, textAlign: 'right' }}>{question.highLabel}</Text></View>
  </View>
}

export function QuestionControls(props: QuestionControlProps) {
  const { question, answer, disabled, controller, words } = props
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  if (question.type === 'scale') return <QuestionScale {...props} />
  if (question.type === 'slider') return <View style={{ minWidth: 0, gap: 8 }}>
    <Text style={{ fontSize: 14, lineHeight: 20, color: tokens.fg2 }}>{answer?.number === undefined ? `${question.min} ${question.unit} / ${question.max} ${question.unit}` : `${answer.number} ${question.unit}`}</Text>
    <Slider label={question.prompt} min={question.min} max={question.max} step={question.step} value={answer?.number} valueText={`${answer?.number ?? question.min} ${question.unit}`} disabled={disabled} onChange={number => controller.setAnswer(question, { number })} />
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

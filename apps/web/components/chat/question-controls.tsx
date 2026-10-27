'use client'

import { useLocale } from 'next-intl'
import { formatQuestionNumber, type QuestionControlProps } from '@orbit/shared/chat'
import { RadioGroup, RadioItem } from '@/components/ui/radio-group'
import { RadioRow } from '@/components/ui/select-check'
import { CheckRow } from '@/components/ui/check-row'
import { Input } from '@/components/ui/input'
import { Slider } from '@/components/ui/slider'

function QuestionScale({ question, answer, disabled, controller }: QuestionControlProps) {
  if (question.type !== 'scale') return null
  return <div className="flex min-w-0 flex-col gap-2">
    <RadioGroup aria-label={question.prompt} aria-required="true" className="grid grid-cols-5">
      {[1, 2, 3, 4, 5].map(number => <RadioItem key={number} selected={answer?.number === number} disabled={disabled} onSelect={() => controller.setAnswer(question, { number })}>
        <button type="button" role="radio" aria-label={String(number)} aria-checked={answer?.number === number} disabled={disabled}
          className="orbit-selection-ring min-h-[var(--touch-min)] min-w-0 rounded-[var(--r-well)] border-0 bg-transparent p-2 text-base text-[var(--fg-1)] transition-[background-color] duration-[var(--dur-hover-control)] ease-[var(--ease-standard)] hover:bg-[var(--bg-hover)] active:bg-[var(--bg-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--primary)] aria-checked:bg-[var(--bg-well)] disabled:opacity-60">{number}</button>
      </RadioItem>)}
    </RadioGroup>
    <div className="grid min-w-0 grid-cols-2 gap-4 text-sm text-[var(--fg-3)]"><span className="break-words">{question.lowLabel}</span><span className="break-words text-right">{question.highLabel}</span></div>
  </div>
}

export function QuestionControls(props: QuestionControlProps) {
  const { question, answer, disabled, controller, words } = props
  const locale = useLocale()
  const numberLabel = (value: number) => formatQuestionNumber(value, locale)
  if (question.type === 'scale') return <QuestionScale {...props} />
  if (question.type === 'slider') return <div className="flex min-w-0 flex-col gap-2">
    <p className="break-words text-sm text-[var(--fg-2)]">{answer?.number === undefined ? `${numberLabel(question.min)} ${question.unit} / ${numberLabel(question.max)} ${question.unit}` : `${numberLabel(answer.number)} ${question.unit}`}</p>
    <Slider label={question.prompt} min={question.min} max={question.max} step={question.step} value={answer?.number} valueText={`${numberLabel(answer?.number ?? question.min)} ${question.unit}`} disabled={disabled} onChange={number => controller.setAnswer(question, { number })} />
  </div>
  const choices = question.type === 'yesNo' ? [true, false].map(boolean => ({ id: String(boolean), label: boolean ? words.yes : words.no, recommended: false })) : question.options
  const rows = choices.map(option => question.type === 'multipleChoice'
    ? <CheckRow key={option.id} selection wrapLabel label={option.label} checked={answer?.selectedIds?.includes(option.id) === true} disabled={disabled} onChange={() => controller.select(question, option.id)} />
    : <RadioRow key={option.id} selection wrapLabel hideMeta label={option.label} description={option.recommended ? words.recommended : undefined}
        selected={question.type === 'yesNo' ? answer?.boolean === (option.id === 'true') : answer?.selectedIds?.includes(option.id)}
        onSelect={() => question.type === 'yesNo' ? controller.setAnswer(question, { boolean: option.id === 'true' }) : controller.select(question, option.id)}
        {...(disabled ? { disabled: true as const, reasonScope: 'group' as const } : { disabled: false as const })} />)
  return <div className="flex min-w-0 flex-col gap-4">
    {question.type === 'multipleChoice' ? <div role="group" aria-label={question.prompt}>{rows}</div> : <RadioGroup aria-label={question.prompt} aria-required="true">{rows}</RadioGroup>}
    {question.allowFreeText ? <Input label={words.freeText} value={answer?.freeText ?? ''} onChange={value => controller.setFreeText(question, value)} disabled={disabled} maxLength={500} /> : null}
  </div>
}

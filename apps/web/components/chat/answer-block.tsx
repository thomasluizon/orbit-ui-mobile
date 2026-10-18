'use client'

import { useCallback, useRef, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { blockAnswerErrorKey, blockAnswerOptions, hasBlockAnswer, formatBlockAnswer, type AnswerBlockProps } from '@orbit/shared/chat'
import { BlockFrame } from '@/components/ui/block-frame'
import { RadioGroup } from '@/components/ui/radio-row'
import { RadioRow } from '@/components/ui/select-check'
import { CheckRow } from '@/components/ui/check-row'
import { Proposed } from '@/components/ui/proposed'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/pill-button'
import { Check, Lock, ArrowUp } from '@/components/ui/icons'

function useAnswer({ definition, interaction }: AnswerBlockProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [freeText, setFreeText] = useState('')
  const [acting, setActing] = useState(false)
  const [settled, setSettled] = useState<{ text: string; answered: boolean } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const sending = useRef(false)
  const locale = useLocale()
  const t = useTranslations('chat.choice')
  const options = blockAnswerOptions(definition)
  const submit = async () => {
    if (sending.current || !interaction || !interaction.isOnline || interaction.isSending ||
      (definition.kind === 'choice' && interaction.atMessageLimit) || !hasBlockAnswer(definition, selectedIds, freeText)) return
    sending.current = true
    setActing(true)
    setError(null)
    const labels = options.filter(option => selectedIds.includes(option.id)).map(option => option.label)
    try {
      const result = await interaction.send({ kind: definition.kind, labels,
        answer: { blockId: definition.block.blockId, selectedIds, ...(freeText.trim() ? { freeText: freeText.trim() } : {}) } })
      if (result.ok) setSettled({ text: t('answered', { options: formatBlockAnswer(labels, freeText, locale) }), answered: true })
      else {
        const key = blockAnswerErrorKey(result.status)
        if (key === 'closed' || key === 'alreadyAnswered') setSettled({ text: t(key), answered: false })
        else setError(t(key))
      }
    } catch {
      setError(t('error'))
    } finally {
      sending.current = false
      setActing(false)
    }
  }
  return { selectedIds, setSelectedIds, freeText, setFreeText, acting, settled, error, submit }
}


function AnswerOptions({ definition, answer, disabled }: Readonly<{
  definition: AnswerBlockProps['definition']
  answer: ReturnType<typeof useAnswer>
  disabled: boolean
}>) {
  const t = useTranslations('chat.choice')
  const options = blockAnswerOptions(definition)
  const single = definition.kind === 'choice' && !definition.block.multiSelect
  return options.map((option, index) => single
    ? <RadioRow wrapLabel key={option.id} label={option.label} description={option.description ?? undefined}
        meta={t('position', { position: index + 1, total: options.length })}
        selected={answer.selectedIds.includes(option.id)}
        onSelect={() => answer.setSelectedIds([option.id])}
        {...(disabled ? { disabled: true as const, reason: t('acting') } : { disabled: false as const })} />
    : <Proposed key={option.id} proposed={definition.kind === 'pickList' && !answer.selectedIds.includes(option.id)} scope="row" label={t('proposed')} inset keepMounted>
        <CheckRow wrapLabel label={option.label} description={option.description ?? undefined}
          proposed={definition.kind === 'pickList' && !answer.selectedIds.includes(option.id)}
          checked={answer.selectedIds.includes(option.id)} disabled={disabled}
          onChange={checked => answer.setSelectedIds(current => checked ? [...current, option.id] : current.filter(id => id !== option.id))} />
      </Proposed>)
}

type AnswerContentProps = Readonly<{
  definition: AnswerBlockProps['definition']
  interaction?: AnswerBlockProps['interaction']
  answer: ReturnType<typeof useAnswer>
  disabled: boolean
}>

function AnswerBody({ definition, answer, disabled }: AnswerContentProps) {
  const t = useTranslations('chat.choice')
  const isChoice = definition.kind === 'choice'
  const single = isChoice && !definition.block.multiSelect
  const title = isChoice ? definition.block.question : definition.block.title
  return <div className="flex min-w-0 flex-col gap-4">
        {single ? <RadioGroup aria-label={title} onKeyDown={event => {
          if (event.key === 'Enter' && answer.selectedIds.length) { event.preventDefault(); void answer.submit() }
        }}><AnswerOptions definition={definition} answer={answer} disabled={disabled} /></RadioGroup> : <div role="group" aria-label={title}><AnswerOptions definition={definition} answer={answer} disabled={disabled} /></div>}
        {isChoice && definition.block.allowFreeText ? <Input label={t('freeText')} value={answer.freeText}
          onChange={answer.setFreeText} maxLength={500} disabled={disabled} onSubmit={() => void answer.submit()} /> : null}
        {answer.error ? <p role="alert" className="text-sm text-[var(--status-bad-text)]">{answer.error}</p> : null}
      </div>
}

function AnswerSubmit({ definition, interaction, answer, disabled }: AnswerContentProps) {
  const t = useTranslations('chat.choice')
  const isChoice = definition.kind === 'choice'
  const reason = interaction && !interaction.isOnline ? t('offline')
    : isChoice && interaction?.atMessageLimit ? t('limit', { allowance: interaction.allowance }) : undefined
  return <div className="flex min-w-0 flex-col items-start gap-2">
        <Button variant="ghost" size="sm" loading={answer.acting} disabled={disabled || !interaction || Boolean(reason) || !hasBlockAnswer(definition, answer.selectedIds, answer.freeText)}
          leadingIcon={<ArrowUp size={20} aria-hidden="true" />} onClick={() => void answer.submit()}>{t(isChoice ? 'submit' : 'review')}</Button>
        {reason ? <p className="text-sm text-[var(--fg-3)]">{reason}</p> : null}
      </div>
}

function TerminalAnswer({ text, answered, focus }: Readonly<{ text: string; answered: boolean; focus: boolean }>) {
  const focusLine = useCallback((element: HTMLParagraphElement | null) => {
    if (element && focus) element.focus({ preventScroll: true })
  }, [focus])
  const Glyph = answered ? Check : Lock
  return <p tabIndex={-1} ref={focusLine} className="flex min-w-0 items-start gap-2 text-sm text-[var(--fg-3)]" style={{ outlineWidth: 0 }}>
    <Glyph aria-hidden="true" size={20} strokeWidth={1.5} className="shrink-0" />
    <span className="min-w-0 break-words">{text}</span>
  </p>
}

export function AnswerBlock(props: AnswerBlockProps) {
  const { definition, interaction, expired = false } = props
  const t = useTranslations('chat.choice')
  const answer = useAnswer(props)
  const [focusWhenClosed] = useState(!expired && !props.savedAnswer)
  const isChoice = definition.kind === 'choice'
  const title = isChoice ? definition.block.question : definition.block.title
  const settled = props.savedAnswer ?? answer.settled
  const closed = settled?.text ?? (expired && !answer.acting ? t('closed') : null)
  const disabled = answer.acting || interaction?.isSending === true

  return <div aria-live="polite" aria-atomic="true" className="min-w-0" data-answer-block={definition.kind}>
    {closed ? <TerminalAnswer text={closed} answered={settled?.answered === true} focus={focusWhenClosed} /> : <BlockFrame state={answer.acting ? 'acting' : 'resting'} title={title} wrapTitle items={[]}
      body={<AnswerBody definition={definition} answer={answer} disabled={disabled} />}
      actions={<AnswerSubmit definition={definition} interaction={interaction} answer={answer} disabled={disabled} />} />}
  </div>
}

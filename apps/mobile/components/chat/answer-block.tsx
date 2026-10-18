import { useCallback, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AccessibilityInfo, findNodeHandle, Text, View } from 'react-native'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
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
  const { t: translate, i18n } = useTranslation()
  const locale = i18n.language
  const t = (key: string, values?: Record<string, string | number>) => translate(`chat.choice.${key}`, values)
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
  const { t: translate } = useTranslation()
  const t = (key: string, values?: Record<string, string | number>) => translate(`chat.choice.${key}`, values)
  const options = blockAnswerOptions(definition)
  const single = definition.kind === 'choice' && !definition.block.multiSelect
  return options.map((option, index) => single
    ? <RadioRow selection hideMeta wrapLabel key={option.id} label={option.label} description={option.description ?? undefined}
        meta={t('position', { position: index + 1, total: options.length })}
        selected={answer.selectedIds.includes(option.id)}
        onSelect={() => answer.setSelectedIds([option.id])}
        {...(disabled ? { disabled: true as const, reasonScope: 'group' as const } : { disabled: false as const })} />
    : <AnswerCheckRow key={option.id} definition={definition} option={option} answer={answer} disabled={disabled} proposedLabel={t('proposed')} />)

}

function AnswerCheckRow({ definition, option, answer, disabled, proposedLabel }: Readonly<{
  definition: AnswerBlockProps['definition']
  option: ReturnType<typeof blockAnswerOptions>[number]
  answer: ReturnType<typeof useAnswer>
  disabled: boolean
  proposedLabel: string
}>) {
  const [expanded, setExpanded] = useState(false)
  const contentId = useId()
  const personal = definition.kind === 'pickList'
  const checked = answer.selectedIds.includes(option.id)
  return <Proposed proposed={personal && !checked} scope="row" label={proposedLabel} inset keepMounted>
    <CheckRow selection wrapLabel textMode={personal ? 'personal' : undefined} label={option.label} description={option.description ?? undefined}
      onOpenLabel={personal ? () => setExpanded(current => !current) : undefined} labelExpanded={personal ? expanded : undefined} labelControls={contentId}
      proposed={personal && !checked} checked={checked} disabled={disabled}
      onChange={selected => answer.setSelectedIds(current => selected ? [...current, option.id] : current.filter(id => id !== option.id))} />
  </Proposed>
}

type AnswerContentProps = Readonly<{
  definition: AnswerBlockProps['definition']
  interaction?: AnswerBlockProps['interaction']
  answer: ReturnType<typeof useAnswer>
  disabled: boolean
}>

function AnswerBody({ definition, answer, disabled }: AnswerContentProps) {
  const { t: translate } = useTranslation()
  const t = (key: string, values?: Record<string, string | number>) => translate(`chat.choice.${key}`, values)
  const isChoice = definition.kind === 'choice'
  const single = isChoice && !definition.block.multiSelect
  const title = isChoice ? definition.block.question : definition.block.title
  return <View style={{ minWidth: 0, gap: 16 }}>
        {single ? <RadioGroup accessibilityLabel={title}><AnswerOptions definition={definition} answer={answer} disabled={disabled} /></RadioGroup> : <View role="group" accessibilityLabel={title}><AnswerOptions definition={definition} answer={answer} disabled={disabled} /></View>}
        {isChoice && definition.block.allowFreeText ? <Input label={t('freeText')} value={answer.freeText}
          onChange={answer.setFreeText} maxLength={500} disabled={disabled} onSubmit={() => void answer.submit()} /> : null}
      </View>
}

function AnswerSubmit({ definition, interaction, answer, disabled }: AnswerContentProps) {
  const { t: translate } = useTranslation()
  const t = (key: string, values?: Record<string, string | number>) => translate(`chat.choice.${key}`, values)
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const isChoice = definition.kind === 'choice'
  const reason = answer.acting ? t(isChoice ? 'acting' : 'reviewing') : interaction && !interaction.isOnline ? t('offline')
    : isChoice && interaction?.atMessageLimit ? t('limit', { allowance: interaction.allowance }) : undefined
  const statusError = reason ? null : answer.error
  return <View style={{ minWidth: 0, alignItems: 'flex-end', width: '100%', gap: 8 }}>
        <Button variant="ghost" size="sm" loading={answer.acting} disabled={disabled || !interaction || Boolean(reason) || !hasBlockAnswer(definition, answer.selectedIds, answer.freeText)}
          leadingIcon={<ArrowUp size={20} accessible={false} />} onClick={() => void answer.submit()}>{t(isChoice ? 'submit' : 'review')}</Button>
        <Text accessibilityLiveRegion="polite" accessibilityRole={statusError ? 'alert' : undefined} style={{ color: statusError ? tokens.statusBadText : tokens.fg3, fontSize: 14, lineHeight: 20 }}>{statusError ?? reason ?? ''}</Text>
      </View>
}

function TerminalAnswer({ text, answered, focus }: Readonly<{ text: string; answered: boolean; focus: boolean }>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const focusLine = useCallback((element: View | null) => {
    if (!element || !focus) return
    element.focus()
    const handle = findNodeHandle(element)
    if (handle !== null) AccessibilityInfo.setAccessibilityFocus(handle)
  }, [focus])
  const Glyph = answered ? Check : Lock
  return <View accessible accessibilityLabel={text} tabIndex={-1} ref={focusLine} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
    <Glyph accessible={false} size={20} strokeWidth={1.5} color={tokens.fg3} />
    <Text accessible={false} style={{ flex: 1, minWidth: 0, color: tokens.fg3, fontSize: 14, lineHeight: 20, fontFamily: 'Geist_400Regular' }}>{text}</Text>
  </View>
}

export function AnswerBlock(props: AnswerBlockProps) {
  const { definition, interaction, expired = false } = props
  const { t: translate } = useTranslation()
  const t = (key: string, values?: Record<string, string | number>) => translate(`chat.choice.${key}`, values)
  const answer = useAnswer(props)
  const [focusWhenClosed] = useState(!expired && !props.savedAnswer)
  const isChoice = definition.kind === 'choice'
  const title = isChoice ? definition.block.question : definition.block.title
  const settled = props.savedAnswer ?? answer.settled
  const closed = settled?.text ?? (expired && !answer.acting ? t('closed') : null)
  const disabled = answer.acting || interaction?.isSending === true

  return <View style={{ minWidth: 0 }} testID={`answer-block-${definition.kind}`}>
    {closed ? <TerminalAnswer text={closed} answered={settled?.answered === true} focus={focusWhenClosed} /> : <BlockFrame state={answer.acting ? 'acting' : 'resting'} title={title} wrapTitle items={[]}
      body={<AnswerBody definition={definition} answer={answer} disabled={disabled} />}
      actions={<AnswerSubmit definition={definition} interaction={interaction} answer={answer} disabled={disabled} />} />}
  </View>
}

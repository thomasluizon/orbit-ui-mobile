import {
  blockAnswerErrorKey, blockAnswerOptions, blockCloseOutcome, formatBlockAnswer, hasBlockAnswer, isSameBlockAnswer,
  type AnswerBlockProps,
} from './block-answer'
import type { BlockAnswer } from '../types/chat'
import { fitsQuickOptions } from './question-block-core'

type AnswerTranslationKey = 'answered' | 'closed' | 'alreadyAnswered' | 'invalid' | 'error' |
  'acting' | 'reviewing' | 'offline' | 'limit' | 'position' | 'proposed' | 'freeText' | 'submit' | 'review'
export type AnswerTranslator = (key: AnswerTranslationKey, values?: Record<string, string | number>) => string

export interface AnswerBlockState {
  selectedIds: string[]
  freeText: string
  expandedIds: string[]
  acting: boolean
  settled: { text: string; answered: boolean } | null
  error: string | null
  uncertainAnswer: BlockAnswer | null
}

function closedByHistory(props: AnswerBlockProps): boolean {
  return props.definition.kind === 'choice' && props.definition.block.closedAtUtc !== undefined
}

function answerSnapshot(props: AnswerBlockProps, state: AnswerBlockState): BlockAnswer {
  const freeText = state.freeText.trim()
  return { blockId: props.definition.block.blockId, selectedIds: [...state.selectedIds], ...(freeText ? { freeText } : {}) }
}

export class AnswerBlockController {
  private state: AnswerBlockState = { selectedIds: [], freeText: '', expandedIds: [], acting: false, settled: null, error: null, uncertainAnswer: null }
  private readonly listeners = new Set<() => void>()
  focusWhenClosed: boolean

  constructor(props: AnswerBlockProps) {
    this.focusWhenClosed = !props.expired && !props.savedAnswer && !closedByHistory(props)
  }

  getSnapshot = (): AnswerBlockState => this.state
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  private update(patch: Partial<AnswerBlockState>): void {
    this.state = { ...this.state, ...patch }
    for (const listener of this.listeners) listener()
  }

  setFreeText = (freeText: string): void => { this.update({ freeText }) }
  select = (id: string): void => { this.update({ selectedIds: [id] }) }
  check = (id: string, checked: boolean): void => {
    this.update({ selectedIds: checked ? [...this.state.selectedIds, id] : this.state.selectedIds.filter(selected => selected !== id) })
  }

  toggleExpanded = (id: string): void => {
    this.update({ expandedIds: this.state.expandedIds.includes(id) ? this.state.expandedIds.filter(expanded => expanded !== id) : [...this.state.expandedIds, id] })
  }

  /** Closes the card at once and asks the API to keep it closed. A failure reopens the card with its answers kept. */
  async close(props: AnswerBlockProps, t: AnswerTranslator): Promise<void> {
    if (getAnswerBlockView(props, this.state, t).closeDisabled) return
    const focusWhenClosed = this.focusWhenClosed
    this.focusWhenClosed = false
    this.update({ settled: { text: t('closed'), answered: false }, error: null })
    const reopen = () => { this.focusWhenClosed = focusWhenClosed; this.update({ settled: null, error: t('error') }) }
    try {
      const outcome = blockCloseOutcome(await props.interaction!.close!(props.definition.block.blockId))
      if (outcome === 'alreadyAnswered') this.update({ settled: { text: t('alreadyAnswered'), answered: false } })
      else if (outcome === 'error') reopen()
    } catch { reopen() }
  }

  async submit(props: AnswerBlockProps, t: AnswerTranslator, locale: string): Promise<void> {
    const { definition, interaction } = props
    const { selectedIds, freeText, acting } = this.state
    const answer = answerSnapshot(props, this.state)
    const recovery = isSameBlockAnswer(answer, this.state.uncertainAnswer)
    if (acting || !interaction || interaction.dailyBudgetReached || !interaction.isOnline || interaction.isSending ||
      (definition.kind === 'choice' && interaction.atMessageLimit && !recovery) || !hasBlockAnswer(definition, selectedIds, freeText)) return
    this.update({ acting: true, error: null, uncertainAnswer: answer })
    const labels = blockAnswerOptions(definition).filter(option => selectedIds.includes(option.id)).map(option => option.label)
    try {
      const result = await interaction.send({ kind: definition.kind, labels, answer })
      if (result.ok) this.update({ settled: { text: t('answered', { options: formatBlockAnswer(labels, freeText, locale) }), answered: true } })
      else if (result.dailyBudgetReached || result.allowanceReached) this.update({ error: null, uncertainAnswer: null })
      else {
        const key = blockAnswerErrorKey(result.status)
        if (key === 'closed' || key === 'alreadyAnswered') this.update({ settled: { text: t(key), answered: false } })
        else this.update({ error: t(key) })
      }
    } catch {
      this.update({ error: t('error') })
    } finally {
      this.update({ acting: false })
    }
  }
}

function getAnswerStatus(props: AnswerBlockProps, state: AnswerBlockState, t: AnswerTranslator) {
  const { definition, interaction } = props
  if (interaction?.dailyBudgetReached) return { text: '', error: false, blocked: true }
  if (state.acting) return { text: t(definition.kind === 'choice' ? 'acting' : 'reviewing'), error: false, blocked: true }
  if (interaction && !interaction.isOnline) return { text: t('offline'), error: false, blocked: true }
  if (definition.kind === 'choice' && interaction?.atMessageLimit && !isSameBlockAnswer(answerSnapshot(props, state), state.uncertainAnswer)) return { text: interaction.limitReason ?? t('limit', { allowance: interaction.allowance }), error: false, blocked: true }
  return { text: state.error ?? '', error: Boolean(state.error), blocked: false }
}

export interface AnswerBlockView {
  title: string
  single: boolean
  disabled: boolean
  acting: boolean
  closed: string | null
  answered: boolean
  options: { id: string; label: string; description: string | undefined; selected: boolean; personal: boolean; expanded: boolean; proposed: boolean; position: string }[]
  freeTextLabel: string | null
  proposedLabel: string
  submitLabel: string
  submitDisabled: boolean
  /** True for a choice block whose interaction can close it. A pick list has no close. */
  closable: boolean
  closeDisabled: boolean
  statusError: boolean
  status: string
}

export function getAnswerBlockView(props: AnswerBlockProps, state: AnswerBlockState, t: AnswerTranslator): AnswerBlockView {
  const { definition, interaction } = props
  const isChoice = definition.kind === 'choice'
  const single = isChoice && !definition.block.multiSelect
  const status = getAnswerStatus(props, state, t)
  const settled = props.savedAnswer ?? state.settled
  const closed = settled?.text ?? ((props.expired || closedByHistory(props)) && !state.acting ? t('closed') : null)
  const disabled = interaction?.dailyBudgetReached === true || state.acting || interaction?.isSending === true
  return {
    title: isChoice ? definition.block.question : definition.block.title,
    single,
    disabled,
    acting: state.acting,
    closed,
    answered: settled?.answered === true,
    options: blockAnswerOptions(definition).map((option, index, options) => ({
      ...option,
      description: option.description ?? undefined,
      selected: state.selectedIds.includes(option.id),
      personal: !isChoice,
      expanded: state.expandedIds.includes(option.id),
      proposed: !isChoice && !state.selectedIds.includes(option.id),
      position: t('position', { position: index + 1, total: options.length }),
    })),
    freeTextLabel: isChoice && definition.block.allowFreeText ? t('freeText') : null,
    proposedLabel: t('proposed'),
    submitLabel: t(isChoice ? 'submit' : 'review'),
    submitDisabled: disabled || !interaction || status.blocked || !hasBlockAnswer(definition, state.selectedIds, state.freeText),
    closable: isChoice && interaction?.close !== undefined,
    closeDisabled: Boolean(closed || !interaction?.close || !isChoice || state.acting || !interaction.isOnline),
    statusError: status.error,
    status: status.text,
  }
}


/** A choice or a pick list whose options fit the quick option grid answers with quick options. Each other set keeps the list presentation. */
export function answerUsesQuickOptions(view: Pick<AnswerBlockView, 'options'>): boolean {
  return fitsQuickOptions(view.options)
}

import {
  blockAnswerErrorKey, blockAnswerOptions, formatBlockAnswer, hasBlockAnswer,
  type AnswerBlockProps,
} from './block-answer'

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
}

export class AnswerBlockController {
  private state: AnswerBlockState = { selectedIds: [], freeText: '', expandedIds: [], acting: false, settled: null, error: null }
  private readonly listeners = new Set<() => void>()
  readonly focusWhenClosed: boolean

  constructor(props: AnswerBlockProps) {
    this.focusWhenClosed = !props.expired && !props.savedAnswer
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

  async submit(props: AnswerBlockProps, t: AnswerTranslator, locale: string): Promise<void> {
    const { definition, interaction } = props
    const { selectedIds, freeText, acting } = this.state
    if (acting || !interaction || !interaction.isOnline || interaction.isSending ||
      (definition.kind === 'choice' && interaction.atMessageLimit) || !hasBlockAnswer(definition, selectedIds, freeText)) return
    this.update({ acting: true, error: null })
    const labels = blockAnswerOptions(definition).filter(option => selectedIds.includes(option.id)).map(option => option.label)
    try {
      const result = await interaction.send({ kind: definition.kind, labels,
        answer: { blockId: definition.block.blockId, selectedIds, ...(freeText.trim() ? { freeText: freeText.trim() } : {}) } })
      if (result.ok) this.update({ settled: { text: t('answered', { options: formatBlockAnswer(labels, freeText, locale) }), answered: true } })
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

function getAnswerStatus({ definition, interaction }: AnswerBlockProps, state: AnswerBlockState, t: AnswerTranslator) {
  if (state.acting) return { text: t(definition.kind === 'choice' ? 'acting' : 'reviewing'), error: false, blocked: true }
  if (interaction && !interaction.isOnline) return { text: t('offline'), error: false, blocked: true }
  if (definition.kind === 'choice' && interaction?.atMessageLimit) return { text: t('limit', { allowance: interaction.allowance }), error: false, blocked: true }
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
  statusError: boolean
  status: string
}

export function getAnswerBlockView(props: AnswerBlockProps, state: AnswerBlockState, t: AnswerTranslator): AnswerBlockView {
  const { definition, interaction } = props
  const isChoice = definition.kind === 'choice'
  const single = isChoice && !definition.block.multiSelect
  const status = getAnswerStatus(props, state, t)
  const settled = props.savedAnswer ?? state.settled
  const disabled = state.acting || interaction?.isSending === true
  return {
    title: isChoice ? definition.block.question : definition.block.title,
    single,
    disabled,
    acting: state.acting,
    closed: settled?.text ?? (props.expired && !state.acting ? t('closed') : null),
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
    statusError: status.error,
    status: status.text,
  }
}


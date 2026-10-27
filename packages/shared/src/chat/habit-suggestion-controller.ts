import type { ChatMessage } from '../types/chat'
import type { HabitSuggestionDraft, HabitSuggestionPreviewResult } from '../types/habit-suggestions'
import { attachHabitSuggestionPreview, habitSuggestionStatus, replaceHabitSuggestion } from './habit-suggestions'

export interface HabitSuggestionActions {
  refine: (draft: HabitSuggestionDraft, instruction: string) => Promise<HabitSuggestionDraft>
  preview: (drafts: HabitSuggestionDraft[], all: boolean) => Promise<HabitSuggestionPreviewResult>
  transition: (update: (message: ChatMessage) => ChatMessage) => void
  isCurrent: () => boolean
}

export interface HabitSuggestionState {
  phase: 'preview' | 'refine' | null
  busy: string | null
  tweaking: string | null
  instruction: string
  errors: Record<string, string>
  revisions: Record<string, number>
}

export class HabitSuggestionController {
  private state: HabitSuggestionState = { phase: null, busy: null, tweaking: null, instruction: '', errors: {}, revisions: {} }
  private readonly listeners = new Set<() => void>()
  private readonly retries = new Map<string, (message: ChatMessage, actions: HabitSuggestionActions) => Promise<void>>()
  getSnapshot = (): HabitSuggestionState => this.state
  subscribe = (listener: () => void): (() => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  private update(patch: Partial<HabitSuggestionState>): void {
    this.state = { ...this.state, ...patch }
    for (const listener of this.listeners) listener()
  }
  tweak = (id: string): void => { this.update({ tweaking: this.state.tweaking === id ? null : id, instruction: '' }) }
  setInstruction = (instruction: string): void => { this.update({ instruction }) }
  retry = async (id: string, message: ChatMessage, actions: HabitSuggestionActions): Promise<void> => { await this.retries.get(id)?.(message, actions) }

  async refine(draft: HabitSuggestionDraft, instruction: string, actions: HabitSuggestionActions): Promise<void> {
    if (!actions.isCurrent() || this.state.busy || !instruction.trim()) return
    this.retries.set(draft.id, (_message, currentActions) => this.refine(draft, instruction, currentActions))
    this.update({ phase: 'refine', busy: draft.id, errors: { ...this.state.errors, [draft.id]: '' } })
    try {
      const refined = await actions.refine(draft, instruction.trim())
      if (!actions.isCurrent()) return
      actions.transition(message => replaceHabitSuggestion(message, draft.id, refined))
      this.update({ ...(this.state.tweaking === draft.id ? { tweaking: null, instruction: '' } : {}), revisions: { ...this.state.revisions, [draft.id]: (this.state.revisions[draft.id] ?? 0) + 1 } })
      this.retries.delete(draft.id)
    } catch {
      if (actions.isCurrent()) this.update({ errors: { ...this.state.errors, [draft.id]: 'chat.habitSuggestions.refineError' } })
    } finally { this.update({ busy: null, phase: null }) }
  }

  async preview(drafts: HabitSuggestionDraft[], all: boolean, message: ChatMessage, actions: HabitSuggestionActions): Promise<void> {
    const remaining = drafts.filter(draft => habitSuggestionStatus(message, draft.id) === 'available')
    if (!actions.isCurrent() || this.state.busy || !remaining.length) return
    const id = all ? 'all' : remaining[0]!.id
    const retry = (currentMessage: ChatMessage, currentActions: HabitSuggestionActions) => this.preview(drafts, all, currentMessage, currentActions)
    this.retries.set(id, retry)
    this.update({ phase: 'preview', busy: id, errors: { ...this.state.errors, all: '', ...Object.fromEntries(remaining.map(draft => [draft.id, ''])) } })
    try {
      const result = await actions.preview(remaining, all)
      if (!actions.isCurrent()) return
      if (result.conflictIndex !== undefined) {
        const failedId = remaining[result.conflictIndex]?.id ?? id
        this.retries.set(failedId, retry)
        this.update({ errors: { [failedId]: 'chat.habitSuggestions.conflictError' } })
      } else if (result.response.operation.status === 'PendingConfirmation' && result.response.pendingOperation) {
        const operation = result.response.pendingOperation
        actions.transition(current => attachHabitSuggestionPreview(current, remaining.map(draft => draft.id), operation))
        this.retries.delete(id)
      } else this.update({ errors: { [id]: 'chat.habitSuggestions.previewError' } })
    } catch {
      if (actions.isCurrent()) this.update({ errors: { [id]: 'chat.habitSuggestions.previewError' } })
    } finally { this.update({ busy: null, phase: null }) }
  }
}

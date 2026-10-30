import { suggestionAnswer } from './suggestions.mjs'
import { startingStepAnswer } from './one-small-step.mjs'
import { tsImport } from 'tsx/esm/api'
import { catalogTranslator } from './catalog-translator.mjs'
import { visibleBlock } from './visible-blocks.mjs'
import { visiblePreview } from './visible-preview.mjs'

const { getMessageBubbleView, getMessageBubbleOperations } = await tsImport('../../packages/shared/src/chat/message-bubble.ts', import.meta.url)
const { buildActionChipsModel, resolveActionChipText } = await tsImport('../../packages/shared/src/chat/action-chips.ts', import.meta.url)
const { getAgentOperationLabelKey, getAgentPolicyReasonKey } = await tsImport('../../packages/shared/src/utils/agent-pending-operation.ts', import.meta.url)
const { createBreakdownDrafts } = await tsImport('../../packages/shared/src/hooks/breakdown-suggestion-core.ts', import.meta.url)
const { getBreakdownCadenceKey } = await tsImport('../../packages/shared/src/utils/breakdown-suggestion.ts', import.meta.url)
const { getChatFollowUps } = await tsImport('../../packages/shared/src/chat/follow-ups.ts', import.meta.url)

function visibleConflicts(conflicts) {
  return conflicts.map(({ warning }) => ({
    habits: warning.conflictingHabits.map(({ habitTitle, conflictDescription }) => ({ title: habitTitle, description: conflictDescription })),
    recommendation: warning.recommendation,
  }))
}
function actionChips(actions, t) {
  const model = buildActionChipsModel(actions, true)
  const rows = model.rows.flatMap((row) => {
    const text = resolveActionChipText(row, { translate: t, has: (key) => t.has(key) })
    return text ? [{ label: text.label, meta: row.status === 'failed' ? t('chat.operation.status.Failed') : undefined }] : []
  })
  return rows.length ? { title: t('chat.action.changes'), rows, conflicts: visibleConflicts(model.conflicts) } : undefined
}
function outcomeBlock(outcome, t) {
  return { title: t(`chat.operation.outcome.${outcome.status}`),
    label: outcome.target || t(getAgentOperationLabelKey(outcome.source) ?? 'chat.operation.unknown'),
    meta: t(getAgentPolicyReasonKey(outcome.policyReason) ?? `chat.operation.status.${outcome.status}`),
    action: outcome.status === 'UnsupportedByPolicy' ? t('chat.operation.openProfile') : undefined,
  }
}
function projectionCannotWrite() { throw new Error('Visible answer projection cannot execute an operation.') }

export function visibleAnswer(composition, clientContext, accountDate) {
  if (clientContext?.supportsParts !== true) return composition.aiMessage
  const locale = clientContext.locale ?? 'en'
  if (composition.parts?.some((part) => part.kind === 'oneSmallStep')) {
    try { return startingStepAnswer(composition.parts, locale) } catch (error) {
      error.blockKind = 'oneSmallStep'
      throw error
    }
  }
  if (composition.parts?.some((part) => part.kind === 'habitSuggestions')) {
    try { return suggestionAnswer(composition.parts, locale) } catch (error) {
      error.blockKind = 'habitSuggestions'
      throw error
    }
  }
  const t = catalogTranslator(locale)
  const options = { t, locale, timeFormat: clientContext.timeFormat, accountDate }
  const props = { message: { ...composition, role: 'ai', content: composition.aiMessage ?? '' },
    onPendingOperationConfirmExecute: projectionCannotWrite, onPendingOperationPrepareStepUp: projectionCannotWrite,
    onPendingOperationVerifyStepUp: projectionCannotWrite }
  const view = getMessageBubbleView(props, new Set())
  const operations = getMessageBubbleOperations(props, projectionCannotWrite)
  const parts = view.parts.map((part) => part.type === 'text' ? { type: 'text', text: part.text }
    : { type: 'block', kind: part.part.kind, block: visibleBlock(part.part, options) })
  const pendingOperations = operations.pendingOperations.map(({ pendingOperation }) => ({
    ...(pendingOperation.confirmationRequirement === 'StepUp'
      && pendingOperation.items == null && pendingOperation.changes == null ? {} : visiblePreview(pendingOperation)),
    ...(pendingOperation.confirmationRequirement === 'StepUp'
      && pendingOperation.changeTargetCount !== 0
      && !(pendingOperation.changeTargetCount == null && pendingOperation.items?.length === 0 && !pendingOperation.changes?.length)
      ? { stepUp: { message: t('chat.operation.stepUpMessage'), actionLabel: t('chat.operation.stepUpAction') } } : {}),
  }))
  const outcomes = view.outcomes.map((outcome) => outcomeBlock(outcome, t))
  const actions = actionChips(view.nonSuggestionActions, t)
  const safeText = (text) => t.has(text) ? t(text) : text
  const clarifications = operations.clarifications.map(({ clarificationRequest }) => ({
    question: safeText(clarificationRequest.question), actions: clarificationRequest.quickActions.map((action) => safeText(action.label)),
  }))
  const suggestions = view.suggestions.map(({ parentName, subHabits }) => ({ title: t('chat.breakdown.title', { name: parentName }),
    items: createBreakdownDrafts(subHabits).map((habit) => ({ title: habit.title, cadence: t(getBreakdownCadenceKey(habit.frequencyUnit)) })) }))
  const followUps = getChatFollowUps(props.message).map(({ label }) => label)
  const relatedActions = view.relatedSurfaces.map(({ labelKey }) => t(labelKey))
  const notice = view.showUnreadableReply ? t('chat.unreadableReply')
    : view.showOperationUpdate ? t('chat.operationUpdated') : undefined
  if (!actions && !pendingOperations.length && !outcomes.length && !clarifications.length && !suggestions.length
    && !followUps.length && !relatedActions.length && !notice && parts.every((part) => part.type === 'text')) {
    return parts.map((part) => part.text).join('\n\n')
  }
  return JSON.stringify({ actions, suggestions: suggestions.length ? suggestions : undefined,
    clarifications: clarifications.length ? clarifications : undefined,
    pendingOperations: pendingOperations.length ? pendingOperations : undefined,
    outcomes: outcomes.length ? outcomes : undefined, notice, parts,
    relatedActions: relatedActions.length ? relatedActions : undefined, followUps: followUps.length ? followUps : undefined,
  })
}

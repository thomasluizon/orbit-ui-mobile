import { isDeepStrictEqual } from 'node:util'

const result = (pass, reason) => ({ pass, score: pass ? 1 : 0, reason })
const singleLine = (value) => typeof value === 'string' && value.trim().length > 0 && value.length <= 200 && !/[\r\n]/.test(value)
const canonicalMessage = (message) => typeof message === 'string'
  ? message.replace(/"(?:[^"\\]|\\.)*"/g, (quoted) => JSON.stringify(JSON.parse(quoted))) : null

function expectedActions({ goal, step, language }) {
  const portuguese = language === 'pt-BR'
  const quotedGoal = JSON.stringify(goal)
  const quotedStep = JSON.stringify(step)
  return [
    { id: 'smaller', label: portuguese ? 'Menor ainda' : 'Smaller', message: portuguese
      ? `Quero um passo ainda menor para ${quotedGoal}. O passo anterior foi ${quotedStep}.`
      : `Give me an even smaller starting step for ${quotedGoal}. The previous step was ${quotedStep}.` },
    { id: 'saveTask', label: portuguese ? 'Salvar como tarefa' : 'Save as task', message: portuguese
      ? `Quero salvar ${quotedStep} como tarefa.` : `Save ${quotedStep} as a task.` },
    { id: 'saveChecklistItem', label: portuguese ? 'Salvar no checklist' : 'Save as checklist item', message: portuguese
      ? `Quero adicionar ${quotedStep} ao checklist de um hábito.` : `Add ${quotedStep} to a habit's checklist.` },
  ]
}

export function validStartingBlock(block, locale) {
  const suggestion = block?.suggestion
  if (!singleLine(suggestion?.goal) || !singleLine(suggestion?.step) || suggestion.language !== locale
    || !['en', 'pt-BR'].includes(locale) || !Array.isArray(block.actions) || block.actions.length !== 3) return false
  try {
    return isDeepStrictEqual(block.actions.map((action) => ({ ...action, message: canonicalMessage(action.message) })), expectedActions(suggestion))
  } catch { return false }
}

export function startingStepComposition(parsed, vars) {
  const response = parsed.composition
  const calls = parsed.trace?.calls
  const call = calls?.[0]
  const arguments_ = call?.arguments
  const suggestion = call?.result?.payload
  if (!Array.isArray(calls) || calls.length !== 1 || call.name !== 'suggest_breakdown' || call.resultStatus !== 'Succeeded'
    || arguments_?.one_small_step !== true || arguments_.language !== vars.clientContext.locale
    || !singleLine(arguments_.title) || !Array.isArray(arguments_.suggested_sub_habits) || arguments_.suggested_sub_habits.length !== 1
    || !singleLine(arguments_.suggested_sub_habits[0]?.title)
    || !isDeepStrictEqual(suggestion, { goal: arguments_.title, step: arguments_.suggested_sub_habits[0].title, language: arguments_.language })) {
    return result(false, 'One starting step requires exactly one matching successful suggest_breakdown call.')
  }
  if (['actions', 'pendingOperations', 'policyDenials', 'relatedSurfaces', 'followUps', 'followUpContext'].some((key) => response[key]?.length)
    || (response.operations ?? []).some((operation) => operation.status !== 'Succeeded')) return result(false, 'A starting step cannot include unrelated surfaces or writes.')
  if (vars.composition.mode === 'one-small-step-legacy') {
    return result(!vars.clientContext.partKinds?.includes('oneSmallStep') && response.aiMessage === suggestion.step
      && (response.parts == null || Array.isArray(response.parts) && response.parts.length === 1
        && response.parts[0].type === 'text' && response.parts[0].text === suggestion.step),
    'The legacy answer must contain only the readable starting step.')
  }
  const parts = response.parts
  if (vars.clientContext.supportsParts !== true || !vars.clientContext.partKinds?.includes('oneSmallStep')
    || !Array.isArray(parts) || parts.length !== 1 || parts[0]?.type !== 'block' || parts[0].kind !== 'oneSmallStep'
    || response.aiMessage != null && response.aiMessage !== '' || !validStartingBlock(parts[0].block, vars.clientContext.locale)
    || !isDeepStrictEqual(parts[0].block.suggestion, suggestion)) return result(false, 'Missing one starting-step block with server actions and no prose.')
  const previous = vars.previousStartingStep
  if (previous && suggestion.step === previous.step) {
    return result(false, 'A smaller step must change the previous action; the rubric checks effort and activity.')
  }
  return result(true, 'One starting step and its server actions match the tool evidence.')
}

export function startingStepAnswer(parts, locale) {
  return JSON.stringify({ parts: parts.map((part) => {
    if (part.type !== 'block' || part.kind !== 'oneSmallStep' || !validStartingBlock(part.block, locale)) {
      throw new Error('Malformed oneSmallStep answer.')
    }
    return { type: 'block', kind: part.kind, block: { step: part.block.suggestion.step,
      actions: part.block.actions.map(({ label }) => label) } }
  }) })
}

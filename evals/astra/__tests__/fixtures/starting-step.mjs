import { chatResponse, toolCall } from './producer.mjs'

export function startingResponse(locale = 'en', requestId = 'request', suppliedSuggestion, supportsContext = false) {
  const portuguese = locale === 'pt-BR'
  const suggestion = suppliedSuggestion ?? { goal: portuguese ? 'Estudar' : 'Study', step: portuguese ? 'Abrir o livro' : 'Open the book', language: locale }
  const goal = JSON.stringify(suggestion.goal)
  const step = JSON.stringify(suggestion.step)
  const actions = [
    { id: 'smaller', label: portuguese ? 'Menor ainda' : 'Smaller', message: portuguese
      ? `Quero um passo ainda menor para ${goal}. O passo anterior foi ${step}.`
      : `Give me an even smaller starting step for ${goal}. The previous step was ${step}.` },
    { id: 'saveTask', label: portuguese ? 'Salvar como tarefa' : 'Save as task', message: portuguese
      ? `Quero salvar ${step} como tarefa.` : `Save ${step} as a task.` },
    { id: 'saveChecklistItem', label: portuguese ? 'Salvar no checklist' : 'Save as checklist item', message: portuguese
      ? `Quero adicionar ${step} ao checklist de um hábito.` : `Add ${step} to a habit's checklist.` },
  ]
  if (supportsContext) actions[0].previousStep = structuredClone(suggestion)
  const call = toolCall('suggest_breakdown', { one_small_step: true, language: locale,
    title: suggestion.goal, suggested_sub_habits: [{ title: suggestion.step }] }, 'Succeeded', 'call-1', { supportsParts: true }, true)
  call.result.payload = suggestion
  return { ...chatResponse(requestId, [call]), aiMessage: null,
    parts: [{ type: 'block', kind: 'oneSmallStep', block: { suggestion, actions } }] }
}

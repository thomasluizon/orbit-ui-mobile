import { tsImport } from 'tsx/esm/api'
import { catalogTranslator } from './catalog-translator.mjs'

const { formatBlockAnswer } = await tsImport('../../packages/shared/src/chat/block-answer.ts', import.meta.url)
const { questionAnswerLabels } = await tsImport('../../packages/shared/src/chat/question-block-core.ts', import.meta.url)

const result = (pass, reason) => ({ pass, score: pass ? 1 : 0, reason })
const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu
const normalize = (value) => String(value ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
const sameSet = (left, right) => left.length === right.length && left.every((id) => right.includes(id))
const cardKinds = ['choice', 'question']

// Producer: orbit-api AskTool gives a choice option a server-only target_ids list (the habits read this turn that the option
// stands for); the eval trace keeps the ask arguments, so a set option's coverage is read there, never guessed from its label.
function declaredTargets(trace) {
  return new Map((trace?.calls ?? []).filter((call) => call.name === 'ask' && call.resultStatus === 'Succeeded')
    .flatMap((call) => call.arguments?.input?.options ?? [])
    .filter((option) => typeof option?.id === 'string' && Array.isArray(option.target_ids))
    .map((option) => [option.id, option.target_ids]))
}

// One selectable list per question: a choice block is one list; a question block has one list per choice question.
function selectionLists(part) {
  if (part.kind === 'choice') return [{ id: null, prompt: part.block.question, many: part.block.multiSelect === true, options: part.block.options }]
  return part.block.questions.map((question) => ({ id: question.id, prompt: question.prompt,
    many: question.type === 'multipleChoice', options: ['singleChoice', 'multipleChoice'].includes(question.type) ? question.options ?? [] : [] }))
}

function wantsDeletion(prompt) {
  const text = normalize(prompt)
  const deletion = /delet|remov|exclu|apag/u.test(text)
  return deletion && !/renam|renome|keep|mant/u.test(text) ? true : !deletion && /renam|renome|keep|mant/u.test(text) ? false : null
}

// The selection that states the person's decision on one list, or null when the list cannot hold it.
function selectionFor(list, targets, decision) {
  const parts = wantsDeletion(list.prompt) === false ? [decision.renamed, decision.deleted] : [decision.deleted, decision.renamed]
  for (const part of parts) {
    const fitting = list.options.filter((option) => targets.get(option.id).length && targets.get(option.id).every((id) => part.includes(id)))
    const chosen = list.many ? fitting : fitting.filter((option) => sameSet(targets.get(option.id), part)).slice(0, 1)
    if (chosen.length && sameSet([...new Set(chosen.flatMap((option) => targets.get(option.id)))], part)) return chosen
  }
  return null
}

// A card holds the answer when each stored child is selectable as a record or through a set option, every option id
// that names a record is a stored child, and one selection the card allows states the whole decision.
export function sameTitleCard(output, vars) {
  const children = vars.sameTitleBaseline?.children?.map((child) => child.id) ?? []
  const answer = vars.sameTitleSet?.answer
  if (!children.length || !answer) return { ...result(false, 'The same-title card lacks its baseline or decision.') }
  const cards = (output.composition?.parts ?? []).filter((part) => part?.type === 'block' && cardKinds.includes(part.kind))
  if (!cards.length) return { ...result(true, 'The question has no card; the person types the answer.'), message: answer.text }
  if (cards.length !== 1) return result(false, 'The question turn shows more than one card.')
  const card = cards[0]
  const declared = declaredTargets(output.trace)
  const lists = selectionLists(card)
  const options = lists.flatMap((list) => list.options)
  const targets = new Map(options.map((option) => [option.id, children.includes(option.id) ? [option.id] : declared.get(option.id) ?? []]))
  if (options.some((option) => guid.test(option.id) && !children.includes(option.id))
    || [...targets.values()].flat().some((id) => !children.includes(id))) {
    return result(false, 'A card option names a record that is not a stored same-title child.')
  }
  const covered = new Set([...targets.values()].flat())
  if (!children.every((id) => covered.has(id))) return result(false, `The card lets the person select ${covered.size} of the ${children.length} same-title children.`)
  const decision = { deleted: answer.deleted.map((position) => children[position]), renamed: answer.renamed.map((position) => children[position]) }
  const selections = lists.map((list) => ({ list, chosen: selectionFor(list, targets, decision) }))
  if (selections.some(({ chosen }) => !chosen)) return result(false, 'No selection the card allows states the whole decision.')
  const locale = vars.clientContext.locale
  const holds = result(true, 'The card can hold the whole decision.')
  if (card.kind === 'choice') {
    const [{ chosen }] = selections
    return { ...holds, message: formatBlockAnswer(chosen.map((option) => option.label), undefined, locale),
      blockAnswer: { blockId: card.block.blockId, selectedIds: chosen.map((option) => option.id) } }
  }
  // Producer: QuestionBlockController.submit labels each question "<prompt>: <labels>" with questionAnswerLabels, and
  // BlockAnswerSubmission.send posts formatBlockAnswer of those labels as the message.
  const answers = selections.map(({ list, chosen }) => ({ questionId: list.id, selectedIds: chosen.map((option) => option.id) }))
  const t = catalogTranslator(locale)
  const labels = questionAnswerLabels(card.block, Object.fromEntries(answers.map((answer) => [answer.questionId, answer])),
    { yes: t('common.yes'), no: t('common.no') }, locale)
  return { ...holds, message: formatBlockAnswer(labels, undefined, locale), blockAnswer: { blockId: card.block.blockId, selectedIds: [], answers } }
}

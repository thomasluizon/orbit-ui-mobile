import { tsImport } from 'tsx/esm/api'
import { catalogTranslator } from './catalog-translator.mjs'
import { guid } from './fixtures/api.mjs'

const { formatBlockAnswer } = await tsImport('../../packages/shared/src/chat/block-answer.ts', import.meta.url)
const { questionAnswerLabels } = await tsImport('../../packages/shared/src/chat/question-block-core.ts', import.meta.url)

const result = (pass, reason) => ({ pass, score: pass ? 1 : 0, reason })
const emptyGuid = /^[0-]+$/u
const normalize = (value) => String(value ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
const sameSet = (left, right) => left.length === right.length && left.every((id) => right.includes(id))
const cardKinds = ['choice', 'question']
const choiceTypes = ['choice', 'singleChoice', 'multipleChoice']
// The grader-limit wording starts "The grader cannot", so the report never blames the model for a card it cannot read.
const graderLimit = (cause, prompt) => result(false, `The grader cannot ${cause}: ${prompt}`)
const cannotTell = 'tell which action the card question asks about (delete or rename)'

// Producer: orbit-api AskTool gives a choice option a server-only target_ids list (the habits read this turn that the option
// stands for); the eval trace keeps the ask arguments, so a set option's coverage is read there, never guessed from its label.
function declaredTargets(trace) {
  return new Map((trace?.calls ?? []).filter((call) => call.name === 'ask' && call.resultStatus === 'Succeeded')
    .flatMap((call) => call.arguments?.input?.options ?? [])
    .filter((option) => typeof option?.id === 'string' && Array.isArray(option.target_ids))
    .map((option) => [option.id, option.target_ids]))
}

// Producer: AiChoiceSelection.TargetsOf takes an option's declared target_ids first, and its own id only when the option
// declares none and that id is a nonempty GUID. A question option has no target_ids, so its own id is what the model reads.
function targetsOf(option, declared) {
  if (declared.get(option.id)?.length) return declared.get(option.id)
  return guid.test(option.id) && !emptyGuid.test(option.id) ? [option.id] : []
}

// One list per question: a choice block is one list; a question block has one list per question. Only a choice list has
// options; a yesNo, scale or slider list (orbit-api AskTool accepts all three) keeps its type for the grader to read.
function selectionLists(part) {
  if (part.kind === 'choice') return [{ id: null, type: 'choice', prompt: part.block.question, many: part.block.multiSelect === true, options: part.block.options }]
  return part.block.questions.map((question) => ({ id: question.id, type: question.type, prompt: question.prompt,
    many: question.type === 'multipleChoice', options: choiceTypes.includes(question.type) ? question.options ?? [] : [] }))
}

// Action words of both locales, matched on the normalized question at a word start. The production request renames with
// "coloca"; the recorded cards and the corpus histories use excluir, apagar, renomear, manter, change, delete and keep.
// The habits to keep are the habits to rename, so keep and manter are rename words.
const deletionWords = /\b(?:delet|remov|exclu|apag|elimin|descart|drop|eras|discard)/u
const renameWords = /\b(?:renam|renome|chang|mud|troc|coloc|becom|updat|atualiz|title\b|titulo\b|keep|mant)/u
// Count words for one half of the six children. One, um and uma also read as a pronoun or an article, so only the digit
// states one. A digit inside a title such as 710ml or 1.18L is no count.
const countWords = { 2: ['two', 'dois', 'duas'], 3: ['three', 'tres'], 4: ['four', 'quatro'], 5: ['five', 'cinco'], 6: ['six', 'seis'] }
const statesCount = (text, count) => new RegExp(`(?<![\\w.])(?:${[count, ...countWords[count] ?? []].join('|')})(?!\\w|\\.\\d)`, 'u').test(text)
const onlyOne = (deleted, renamed) => deleted === renamed ? null : deleted ? 'deleted' : 'renamed'

// The half of the decision a list question asks about: the action it names, else the count it states. Null when it names
// neither, or when the two point at different halves.
function askedHalf(prompt, decision) {
  const text = normalize(prompt)
  const byAction = onlyOne(deletionWords.test(text), renameWords.test(text))
  const byCount = onlyOne(statesCount(text, decision.deleted.length), statesCount(text, decision.renamed.length))
  return byAction && byCount && byAction !== byCount ? null : byAction ?? byCount
}

// The selection that states one half of the decision on one list, or null when the list cannot hold that half.
function selectionOf(list, targets, part) {
  const fitting = list.options.filter((option) => targets.get(option.id).length && targets.get(option.id).every((id) => part.includes(id)))
  const chosen = list.many ? fitting : fitting.filter((option) => sameSet(targets.get(option.id), part)).slice(0, 1)
  return chosen.length && sameSet([...new Set(chosen.flatMap((option) => targets.get(option.id)))], part) ? chosen : null
}

// A list that can hold one half is answered with it; a list that can hold both is answered with the half its question
// asks about, and the grader never guesses one when the question does not tell.
function selectionFor(list, targets, decision) {
  const halves = { deleted: selectionOf(list, targets, decision.deleted), renamed: selectionOf(list, targets, decision.renamed) }
  const fitting = Object.keys(halves).filter((half) => halves[half])
  const half = fitting.length === 2 ? askedHalf(list.prompt, decision) : fitting[0]
  if (fitting.length === 2 && !half) return { limit: cannotTell }
  return { chosen: halves[half] ?? null, half }
}

// Each question read: a choice list's selection and its half, the half a yesNo question names, or the grader's limit.
// The grader answers no scale or slider question, and never guesses what a yesNo question that names no half confirms.
function readList(list, targets, decision) {
  if (choiceTypes.includes(list.type)) return selectionFor(list, targets, decision)
  if (list.type !== 'yesNo') return { limit: `answer a ${list.type} card question` }
  const names = askedHalf(list.prompt, decision)
  return names ? { names } : { limit: cannotTell }
}

// Producer: QuestionBlockController.submit labels each question "<prompt>: <labels>" with questionAnswerLabels (a yesNo
// answer as the catalog's yes word), and BlockAnswerSubmission.send posts formatBlockAnswer of those labels as the message.
function questionAnswer(card, readings, locale) {
  const answers = readings.map(({ list, chosen }) => chosen ? { questionId: list.id, selectedIds: chosen.map((option) => option.id) }
    : { questionId: list.id, boolean: true })
  const t = catalogTranslator(locale)
  const labels = questionAnswerLabels(card.block, Object.fromEntries(answers.map((answer) => [answer.questionId, answer])),
    { yes: t('common.yes'), no: t('common.no') }, locale)
  return { message: formatBlockAnswer(labels, undefined, locale), blockAnswer: { blockId: card.block.blockId, selectedIds: [], answers } }
}

// A card holds the answer when each stored child is selectable as a record or through a set option, every record an
// option stands for is a stored child, and one selection the card allows states the whole decision. The choice lists
// state one half; a yesNo question beside them that names the other half is answered yes.
export function sameTitleCard(output, vars) {
  const children = vars.sameTitleBaseline?.children?.map((child) => child.id) ?? []
  const answer = vars.sameTitleSet?.answer
  if (!children.length || !answer) return result(false, 'The same-title card lacks its baseline or decision.')
  const cards = (output.composition?.parts ?? []).filter((part) => part?.type === 'block' && cardKinds.includes(part.kind))
  if (!cards.length) return { ...result(true, 'The question has no card; the person types the answer.'), message: answer.text }
  if (cards.length !== 1) return result(false, 'The question turn shows more than one card.')
  const card = cards[0]
  const declared = declaredTargets(output.trace)
  const lists = selectionLists(card)
  const options = lists.flatMap((list) => list.options)
  const targets = new Map(options.map((option) => [option.id, targetsOf(option, declared)]))
  if ([...targets.values()].flat().some((id) => !children.includes(id))) {
    return result(false, 'A card option names a record that is not a stored same-title child.')
  }
  const covered = new Set([...targets.values()].flat())
  if (!children.every((id) => covered.has(id))) return result(false, `The card lets the person select ${covered.size} of the ${children.length} same-title children.`)
  const decision = { deleted: answer.deleted.map((position) => children[position]), renamed: answer.renamed.map((position) => children[position]) }
  const readings = lists.map((list) => ({ list, ...readList(list, targets, decision) }))
  // A grader limit, not a model fault: the report names the question so a reader can judge it. The model-fault wording
  // below is only for a card whose every question the grader reads.
  const unread = readings.find((reading) => reading.limit)
  if (unread) return graderLimit(unread.limit, unread.list.prompt)
  const selections = readings.filter((reading) => choiceTypes.includes(reading.list.type))
  if (selections.some(({ chosen }) => !chosen)) return result(false, 'No selection the card allows states the whole decision.')
  const stated = new Set(selections.map(({ half }) => half))
  const unconfirmed = readings.find(({ names }) => names && (stated.size !== 1 || stated.has(names)))
  if (unconfirmed) return graderLimit('answer a yes or no card question about the half the selection states', unconfirmed.list.prompt)
  const locale = vars.clientContext.locale
  const holds = result(true, 'The card can hold the whole decision.')
  if (card.kind === 'question') return { ...holds, ...questionAnswer(card, readings, locale) }
  const [{ chosen }] = selections
  return { ...holds, message: formatBlockAnswer(chosen.map((option) => option.label), undefined, locale),
    blockAnswer: { blockId: card.block.blockId, selectedIds: chosen.map((option) => option.id) } }
}

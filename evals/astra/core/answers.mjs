import { tsImport } from 'tsx/esm/api'
import { optionTargets, questionAnswer, sameTitleCard, selectionLists, shownCards } from '../same-title-card.mjs'

const { formatBlockAnswer } = await tsImport('../../../packages/shared/src/chat/block-answer.ts', import.meta.url)

const pickedRecord = (pick, records) => typeof pick === 'string' ? records[pick] : records[pick.of][pick.position]

// The card answer that selects one record: the one option of the card that stands for exactly that record.
function pickOnCard(card, trace, recordId, locale) {
  const lists = selectionLists(card)
  if (lists.length !== 1) return null
  const targets = optionTargets(lists, trace)
  const option = lists[0].options.find((candidate) => targets.get(candidate.id).length === 1 && targets.get(candidate.id)[0] === recordId)
  if (!option) return null
  if (card.kind === 'question') return questionAnswer(card, [{ list: lists[0], chosen: [option] }], locale)
  return { message: formatBlockAnswer([option.label], undefined, locale),
    blockAnswer: { blockId: card.block.blockId, selectedIds: [option.id] } }
}

// What the person does when a turn ends without a preview: answer the card through blockAnswer when the card can hold
// the decision of the case, and type the decision when no card can. A same-title card that cannot hold the decision
// fails the case, because the person cannot answer it.
export function answerQuestion(turn, vars) {
  const { answer, records } = vars.core
  const locale = vars.clientContext.locale
  if (!answer) return { pass: false, reason: 'The assistant asked, and the request needs no question.' }
  const output = { composition: turn.response, trace: turn.trace }
  if (answer.sameTitle) {
    const card = sameTitleCard(output, { clientContext: vars.clientContext,
      sameTitleBaseline: { children: records.children.map((id) => ({ id })) },
      sameTitleSet: { answer: { ...answer.sameTitle, text: answer.text[locale] } } })
    return card.pass ? card : { ...card, graderLimit: card.reason.startsWith('The grader cannot') }
  }
  const cards = shownCards(output)
  if (cards.length > 1) return { pass: false, reason: 'The question turn shows more than one card.' }
  const selection = cards.length ? pickOnCard(cards[0], turn.trace, pickedRecord(answer.pick, records), locale) : null
  return { pass: true, ...(selection ?? { message: answer.text[locale] }) }
}

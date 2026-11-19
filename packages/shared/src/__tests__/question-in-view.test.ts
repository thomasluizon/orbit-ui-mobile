import { describe, expect, it } from 'vitest'
import { questionBlockFixture as block } from '../test-support/question-fixtures'
import { followQuestionInView, moveQuestionInView, startQuestionInView, type QuestionBlockState } from '../chat'

const state = (patch: Partial<QuestionBlockState> = {}): QuestionBlockState => ({ answers: {}, invalidIds: [], validationAttempt: 0, acting: false, settled: null, error: null, uncertainAnswer: null, ...patch })
const questions = block.questions

describe('the one question a block shows', () => {
  it('starts on the first question', () => {
    expect(startQuestionInView(questions, state()).index).toBe(0)
  })

  it('moves to the next question after a quick option answers a single choice or a yes or no question', () => {
    const start = startQuestionInView(questions, state())
    const chosen = state({ answers: { time: { questionId: 'time', selectedIds: ['morning'] } } })
    expect(followQuestionInView(start, questions, chosen).index).toBe(1)
    const last = moveQuestionInView(start, questions, state(), 1)
    const atEnd = { ...last, index: questions.length - 1, answer: undefined }
    expect(followQuestionInView(atEnd, questions, state({ answers: { reminder: { questionId: 'reminder', boolean: false } } })).index).toBe(questions.length - 1)
  })

  it.each([true, false])('moves to the next question after a yes or no question that is not the last answers %s', (boolean) => {
    const yesNo = questions.find((question) => question.type === 'yesNo')!
    const next = questions.find((question) => question.type === 'singleChoice')!
    const pair = [yesNo, next]
    const start = startQuestionInView(pair, state())
    const answered = state({ answers: { [yesNo.id]: { questionId: yesNo.id, boolean } } })
    expect(followQuestionInView(start, pair, answered).index).toBe(pair.indexOf(next))
  })

  it('stays on the question while the person types the free path or picks several answers', () => {
    const start = startQuestionInView(questions, state())
    expect(followQuestionInView(start, questions, state({ answers: { time: { questionId: 'time', freeText: 'After lunch' } } })).index).toBe(0)
    const second = moveQuestionInView(start, questions, state(), 1)
    expect(followQuestionInView(second, questions, state({ answers: { activities: { questionId: 'activities', selectedIds: ['walk'] } } })).index).toBe(1)
  })

  it('returns the same view when nothing changed, and an earlier answer does not move a later view', () => {
    const start = startQuestionInView(questions, state())
    expect(followQuestionInView(start, questions, state())).toBe(start)
    const answered = state({ answers: { time: { questionId: 'time', selectedIds: ['morning'] } } })
    const back = moveQuestionInView(followQuestionInView(start, questions, answered), questions, answered, -1)
    expect(back.index).toBe(0)
    expect(followQuestionInView(back, questions, answered)).toBe(back)
  })

  it('shows the first question that still needs an answer after a failed submit', () => {
    const start = moveQuestionInView(startQuestionInView(questions, state()), questions, state(), 1)
    const failed = state({ invalidIds: ['energy', 'duration'], validationAttempt: 1 })
    expect(followQuestionInView(start, questions, failed)).toMatchObject({ index: 2, attempt: 1 })
  })

  it('keeps the previous and next moves inside the block', () => {
    const start = startQuestionInView(questions, state())
    expect(moveQuestionInView(start, questions, state(), -1).index).toBe(0)
    let view = start
    for (let step = 0; step < questions.length + 2; step++) view = moveQuestionInView(view, questions, state(), 1)
    expect(view.index).toBe(questions.length - 1)
  })
})

describe('the one rule of the quick options', () => {
  const option = (id: string, label: string = id, description?: string) => ({ id, label, description, selected: false, personal: false, expanded: false, proposed: false, position: '' })

  it('answers 2 to 4 options with no detail line with quick options', async () => {
    const { answerUsesQuickOptions } = await import('../chat')
    expect(answerUsesQuickOptions({ options: [option('a'), option('b')] })).toBe(true)
    expect(answerUsesQuickOptions({ options: [option('a')] })).toBe(false)
    expect(answerUsesQuickOptions({ options: ['a', 'b', 'c', 'd', 'e'].map((id) => option(id)) })).toBe(false)
    expect(answerUsesQuickOptions({ options: [option('a', 'a', 'detail'), option('b')] })).toBe(false)
  })

  it.each([
    [1, false], [2, true], [3, true], [4, true], [5, false],
  ])('answers a single choice of %i options with quick options: %s', async (count, expected) => {
    const { usesQuickOptions } = await import('../chat')
    const options = ['a', 'b', 'c', 'd', 'e'].slice(0, count).map((id) => ({ id, label: `Option ${id}` }))
    expect(usesQuickOptions({ id: 'time', prompt: 'When?', allowFreeText: false, type: 'singleChoice', options })).toBe(expected)
  })

  it('keeps the check list for a multiple-choice question whose labels fit', async () => {
    const { usesQuickOptions } = await import('../chat')
    const options = [{ id: 'a', label: 'Walking' }, { id: 'b', label: 'Reading' }, { id: 'c', label: 'Swimming' }]
    expect(usesQuickOptions({ id: 'activities', prompt: 'Which activities?', allowFreeText: true, type: 'multipleChoice', options })).toBe(false)
    expect(usesQuickOptions({ id: 'activities', prompt: 'Which activities?', allowFreeText: true, type: 'singleChoice', options })).toBe(true)
  })

  it('keeps the row layout when one label holds more than 4 words', async () => {
    const { answerUsesQuickOptions, fitsQuickOptions, usesQuickOptions } = await import('../chat')
    expect(fitsQuickOptions([{ label: 'Depois do café da manhã' }, { label: 'À noite' }])).toBe(false)
    expect(fitsQuickOptions([{ label: 'Antes do almoço hoje' }, { label: '  À   noite  ' }])).toBe(true)
    expect(answerUsesQuickOptions({ options: [option('a', 'One two three four five'), option('b')] })).toBe(false)
    const choice = { id: 'time', prompt: 'When?', allowFreeText: false, type: 'singleChoice' as const }
    expect(usesQuickOptions({ ...choice, options: [{ id: 'a', label: 'Right after I wake up' }, { id: 'b', label: 'Later' }] })).toBe(false)
    expect(usesQuickOptions({ ...choice, options: [{ id: 'a', label: 'After I wake up' }, { id: 'b', label: 'Later' }] })).toBe(true)
    expect(usesQuickOptions({ id: 'reminder', prompt: 'Remind you?', allowFreeText: false, type: 'yesNo' })).toBe(true)
  })

  it('does not move to the next question after a single choice that keeps the row layout', () => {
    const long = [{ id: 'long', prompt: 'When?', allowFreeText: false, type: 'singleChoice' as const, options: [{ id: 'a', label: 'Right after I wake up' }, { id: 'b', label: 'Later' }] }, ...questions]
    const start = startQuestionInView(long, state())
    expect(followQuestionInView(start, long, state({ answers: { long: { questionId: 'long', selectedIds: ['a'] } } })).index).toBe(0)
  })
})

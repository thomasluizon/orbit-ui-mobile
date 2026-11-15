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

describe('the quick options of an answer block', () => {
  it('answers 2 to 4 options with no detail line with quick options', async () => {
    const { answerUsesQuickOptions } = await import('../chat')
    const option = (id: string, description?: string) => ({ id, label: id, description, selected: false, personal: false, expanded: false, proposed: false, position: '' })
    expect(answerUsesQuickOptions({ options: [option('a'), option('b')] })).toBe(true)
    expect(answerUsesQuickOptions({ options: [option('a')] })).toBe(false)
    expect(answerUsesQuickOptions({ options: ['a', 'b', 'c', 'd', 'e'].map((id) => option(id)) })).toBe(false)
    expect(answerUsesQuickOptions({ options: [option('a', 'detail'), option('b')] })).toBe(false)
  })
})

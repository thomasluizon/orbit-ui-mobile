import { beforeEach, describe, expect, it, vi } from 'vitest'
import { outcome } from '../client-path.mjs'
import { askGrader } from '../grader-provider.mjs'
import { attempt, caseOf, corpus, itemOf, previewOf, storedHabit, turnOf } from './fixtures/lifecycle-case.mjs'
import { answered, children, combined, parent, sameTitleHabits, sameTitleRecords, withPreview } from './fixtures/same-title-account.mjs'
import { streams } from './fixtures/same-title-streams.mjs'

vi.mock('../grader-provider.mjs', async (original) => ({ ...await original(), askGrader: vi.fn() }))
// No offline test spends a model call: the read of a card question that asks about both halves is a stub that reads the deleted half.
beforeEach(() => { vi.mocked(askGrader).mockReset().mockResolvedValue({ value: { half: 'deleted' } }) })

// The rows of the tests that the lifecycle conversion removed from same-title-set.test.mjs. Each row drives the real case
// through the provider path (runOutcomeCase) against the preview or the server defect that the removed row built.
const sameTitle = corpus.filter((entry) => entry.metadata.id.startsWith('same-title-'))
const idOf = (entry) => entry.metadata.id
const asking = sameTitle.filter((entry) => entry.vars.composition.allowQuestion === true)
const silent = sameTitle.filter((entry) => entry.vars.composition.allowQuestion !== true)
const setup = { habits: sameTitleHabits, records: sameTitleRecords }
const approvedPaths = (fixture) => fixture.calls.map((call) => call.path.split('/').at(-1)).filter((path) => ['confirm', 'execute'].includes(path))

const deleteOf = (id) => itemOf(id, 'Water - 710ml', { delete: [null, null, 'action'] })
const renameOf = (id, title = 'Water - 1.18L') => itemOf(id, 'Water - 710ml', { title: ['Water - 710ml', title] })
const deleting = (positions) => positions.map((at) => deleteOf(children[at]))
const renaming = (positions, title) => positions.map((at) => renameOf(children[at], title))
const previewTurn = (items) => withPreview(combined(items))

// The positions that one expected change names: its `positions`, or `count` records from the end of a deletion and from the
// start of a rename, or the whole set.
const positionsOf = (change) => change.targets.positions
  ?? Array.from({ length: change.targets.count ?? children.length }, (_, at) => change.kind === 'delete' ? children.length - (change.targets.count ?? children.length) + at : at)
const itemsOfCase = (entry) => entry.vars.outcome.changes.flatMap((change) => change.kind === 'delete' ? deleting(positionsOf(change)) : renaming(positionsOf(change), change.fields.title))

describe('the same-title cases of the launch corpus', () => {
  const classes = ['split', 'subset', 'whole', 'parent-match', 'choice-answer', 'typed-answer', 'typed-repeat', 'count-differs', 'singular',
    'delete-all', 'rename-last', 'conversation', 'card']

  it.each([['en', 'en'], ['pt-BR', 'pt']])('cover every #2127 and #2129 request class in %s with one fixture', (locale, suffix) => {
    const ids = [...classes.map((name) => `same-title-${name}-${suffix}`), `same-title-control-thanks-${suffix}`, `same-title-control-order-${suffix}`]
    expect(ids.map((id) => caseOf(id)?.metadata.fixture)).toEqual(ids.map(() => 'same-title-children'))
    expect(sameTitle.filter((entry) => entry.metadata.locale === locale).map(idOf).toSorted()).toEqual(ids.toSorted())
  })

  it('keep the production requests word for word and state each locale once', () => {
    const production = 'eu tenho 7 habitos chamados Water - 710ml deleta dois desses, e os outros 4 coloca Water - 1.18L'
    expect(['same-title-split-pt', 'same-title-card-pt'].map((id) => caseOf(id).vars.input)).toEqual([production, production])
    const conversation = caseOf('same-title-conversation-pt').vars
    expect(conversation.history[0].content).toBe(production)
    expect(conversation.input).toBe('???? caralho cara, eu pedi uma coisa muito simples 2 ultimos habitos vc deleta 4 primeiros habitos chamados water 710ml vc muda pra Water - 1.18L qual a dificuldade?')
    expect(['same-title-delete-all-en', 'same-title-rename-last-en', 'same-title-delete-all-pt', 'same-title-rename-last-pt'].map((id) => caseOf(id).vars.input))
      .toEqual(['Delete all my Water - 710ml habits.', 'Rename the last 2 Water - 710ml habits to Water - 1L.',
        'Apaga todos os meus hábitos Water - 710ml.', 'Renomeia os 2 últimos Water - 710ml para Water - 1L.'])
    for (const entry of sameTitle) expect(entry.metadata.locale, idOf(entry)).toBe(idOf(entry).endsWith('-pt') ? 'pt-BR' : 'en')
    expect(sameTitle.filter((entry) => entry.vars.history).map((entry) => entry.vars.history.at(-1).role)).toEqual(Array(8).fill('assistant'))
  })

  it('expect one preview, ask no question unless the case holds an answer, and ask once for singular requests', () => {
    for (const entry of sameTitle) expect(entry.vars.composition, idOf(entry)).toMatchObject({ mode: 'preview', previews: 1 })
    for (const entry of silent) {
      expect(entry.vars.outcome.questions, idOf(entry)).toBeUndefined()
      expect(entry.vars.answer, idOf(entry)).toBeUndefined()
    }
    for (const entry of asking) expect(entry.vars.answer, idOf(entry)).toBeDefined()
    for (const entry of asking.filter((item) => item.vars.answer.sameTitle)) {
      const { sameTitle: split } = entry.vars.answer
      const [deleted, renamed] = entry.vars.outcome.changes
      expect([...split.deleted, ...split.renamed].toSorted()).toEqual([0, 1, 2, 3, 4, 5])
      expect([split.deleted.length, split.renamed.length], idOf(entry)).toEqual([deleted.targets.count, renamed.targets.count])
      expect([deleted.targets.whenAnswered, renamed.targets.whenAnswered], idOf(entry)).toEqual([split.deleted, split.renamed])
      expect(entry.vars.outcome.questions, idOf(entry)).toEqual({ max: 1 })
    }
    for (const entry of asking.filter((item) => !item.vars.answer.sameTitle)) expect(entry.vars.outcome.questions, idOf(entry)).toEqual({ min: 1, max: 1 })
  })

  it('let only the count and card cases carry one preview note', () => {
    expect(sameTitle.filter((entry) => entry.vars.composition.allowPreviewNote).map(idOf))
      .toEqual(['same-title-split-en', 'same-title-count-differs-en', 'same-title-card-en', 'same-title-split-pt', 'same-title-count-differs-pt', 'same-title-card-pt'])
  })
})

describe('the split preview rows of the removed same-title tests', () => {
  // Producer: the real staging run 3 of the #2127 capture. The assistant held one combined preview that deletes the first
  // two children and renames the other four, after the person answered "Últimos quatro".
  const run3Habits = [storedHabit(parent, 'Water'), ...streams.run3.children.map((id) => storedHabit(id, 'Water - 710ml'))]
  const run3 = (id) => attempt(id, { replies: [turnOf({ pendingOperations: streams.run3.answer.pendingOperations })], habits: run3Habits,
    records: { parent, children: streams.run3.children } })

  it('passes the one combined preview that the API held for the real split request, and fails it for the ordered answer', async () => {
    const split = await run3('same-title-split-pt')
    expect(split.verdict, split.verdict.reason).toMatchObject({ pass: true, reason: 'The saved state matches the approved changes.' })
    const ordered = await run3('same-title-choice-answer-pt')
    expect(ordered.verdict).toMatchObject({ pass: false, reason: expect.stringContaining('The preview does not delete exactly the records of the request.') })
    expect(approvedPaths(ordered.fixture)).toEqual([])
  })

  it('accepts a split over any two and four children, and the ordered split by position in either order', async () => {
    const items = [...deleting([1, 3]), ...renaming([0, 2, 4, 5])]
    expect((await attempt('same-title-split-en', { replies: [previewTurn(items)], ...setup })).verdict.pass).toBe(true)
    const ordered = await attempt('same-title-choice-answer-en', { replies: [previewTurn(items)], ...setup })
    expect(ordered.verdict).toMatchObject({ pass: false, reason: expect.stringContaining('The preview does not delete exactly the records of the request.') })
    expect(approvedPaths(ordered.fixture)).toEqual([])
    expect((await attempt('same-title-choice-answer-en', { replies: [previewTurn([...deleting([4, 5]), ...renaming([0, 1, 2, 3])])], ...setup })).verdict.pass).toBe(true)
    expect((await attempt('same-title-choice-answer-en', { replies: [previewTurn([...renaming([0, 1, 2, 3]), ...deleting([4, 5])])], ...setup })).verdict.pass).toBe(true)
  })

  const splits = [
    ['two separate held operations', turnOf({ pendingOperations: [previewOf('deleteHabits', deleting([4, 5])),
      previewOf('updateHabits', renaming([0, 1, 2, 3]), '22222222-2222-4222-8222-222222222223')] }), 'The request is held in 2 previews.'],
    ['a missing rename', previewTurn(deleting([4, 5])), 'The preview does not update exactly the records of the request. The request needs delete and update; the preview holds delete 2.'],
    ['a missing deletion', previewTurn(renaming([0, 1, 2, 3])), 'The preview does not delete exactly the records of the request. The request needs delete and update; the preview holds update 4.'],
    ['too few deletions', previewTurn([...deleting([5]), ...renaming([0, 1, 2, 3])]), 'The preview does not delete exactly the records of the request. The request needs delete and update; the preview holds delete 1, update 4.'],
    ['a habit in both actions', previewTurn([...deleting([3, 4]), ...renaming([0, 1, 2, 3])]), 'One record is in two changes of the preview.'],
    ['the parent as a target', previewTurn([deleteOf(children[4]), deleteOf(parent), ...renaming([0, 1, 2, 3])]),
      'The preview does not delete exactly the records of the request. The request needs delete and update; the preview holds delete 2, update 4.'],
    ['an unknown habit', previewTurn([...deleting([4, 5]), ...renaming([0, 1, 2]), renameOf('55555555-5555-4555-8555-555555555555')]),
      'The preview does not update exactly the records of the request. The request needs delete and update; the preview holds delete 2, update 4.'],
    ['another title', previewTurn([...deleting([4, 5]), ...renaming([0, 1, 2, 3], 'Water - 1L')]), 'A update of the preview gives title the value "Water - 1L".'],
  ]
  it.each(splits)('rejects the split that has %s, and approves nothing', async (_name, turn, reason) => {
    const { verdict, fixture } = await attempt('same-title-split-en', { replies: [turn], ...setup })
    expect(verdict).toMatchObject({ pass: false, reason })
    expect(approvedPaths(fixture)).toEqual([])
  })

  it('fails a split with no preview', async () => {
    const { verdict, fixture } = await attempt('same-title-split-en', { replies: [turnOf({})], held: [], ...setup })
    expect(verdict).toMatchObject({ pass: false, reason: 'The reply holds no preview and no question card.' })
    expect(approvedPaths(fixture)).toEqual([])
  })

  it.each(silent.map(idOf))('passes the preview that %s asks for with its saved state, and fails it with no readback', async (id) => {
    const turn = previewTurn(itemsOfCase(caseOf(id)))
    const { verdict, response, vars, fixture } = await attempt(id, { replies: [turn], ...setup })
    expect(verdict, verdict.reason).toMatchObject({ pass: true, reason: 'The saved state matches the approved changes.' })
    expect(fixture.calls.map((call) => call.path.split('/').at(-1))).toEqual(['snapshot', 'confirm', 'execute', 'snapshot'])
    expect(fixture.calls.find((call) => call.path.endsWith('/execute')).path).toContain(turn.pendingOperations[0].id)
    delete response.output.readback
    expect(outcome(response.output, { vars })).toMatchObject({ pass: false, reason: 'The approved preview has no saved state readback.' })
  })

  it.each(silent.map(idOf))('fails %s when the assistant asks a question first', async (id) => {
    const { verdict, fixture } = await attempt(id, { replies: [answered[0], previewTurn(itemsOfCase(caseOf(id)))], ...setup })
    expect(verdict).toMatchObject({ pass: false, reason: 'The assistant asked 1 time(s) before a preview; the request allows 0.' })
    expect(approvedPaths(fixture)).toEqual([])
  })
})

describe('the saved state rows of the removed same-title tests', () => {
  const split = previewTurn([...deleting([4, 5]), ...renaming([0, 1, 2, 3])])
  const defects = {
    'a renamed parent': (state) => { state[0].title = 'Water - 1.18L' },
    'a deleted child that remains': (state) => { state.push(storedHabit(children[5], 'Water - 710ml')) },
    'a rename that never landed': (state) => { state.find((habit) => habit.id === children[0]).title = 'Water - 710ml' },
    'a child lost without approval': (state) => { state.splice(1, 1) },
  }
  it.each(Object.entries(defects))('fails the approved split after %s', async (_name, afterDecision) => {
    const { verdict } = await attempt('same-title-split-en', { replies: [split], afterDecision, ...setup })
    expect(verdict.pass).toBe(false)
    expect(verdict.reason).not.toBe('The saved state matches the approved changes.')
  })

  it('fails the approved split when the write saves nothing', async () => {
    const { verdict } = await attempt('same-title-split-en', { replies: [split], savesNothing: true, ...setup })
    expect(verdict).toMatchObject({ pass: false, reason: 'The saved records differ from the approved changes.' })
  })
})

describe('the question rows of the removed same-title tests', () => {
  const asksFirst = asking.filter((entry) => entry.vars.answer.pick).map(idOf)
  const rename = previewOf('updateHabits', [renameOf(children[2])])

  it.each(asksFirst)('fails %s for a rename held without the question, and for a reply that holds neither a preview nor a card', async (id) => {
    const held = await attempt(id, { replies: [turnOf({ pendingOperations: [rename] })], ...setup })
    expect(held.verdict).toMatchObject({ pass: false, reason: 'The assistant held a change without the question that the request needs.' })
    expect(approvedPaths(held.fixture)).toEqual([])
    const text = await attempt(id, { replies: [turnOf({ aiMessage: 'Which one?', parts: [{ type: 'text', text: 'Which one?' }] })], held: [], ...setup })
    expect(text.verdict).toMatchObject({ pass: false, reason: 'The reply holds no preview and no question card.' })
    expect(approvedPaths(text.fixture)).toEqual([])
  })

  it.each(asksFirst)('fails %s for a question turn that shows two cards, and answers none', async (id) => {
    const [{ block }] = answered[0].parts
    const twoCards = turnOf({ parts: [{ type: 'block', kind: 'question', block }, { type: 'block', kind: 'question', block }] })
    const { verdict, sent, fixture } = await attempt(id, { replies: [twoCards, turnOf({ pendingOperations: [rename] })], ...setup })
    expect(verdict).toMatchObject({ pass: false, reason: 'The question turn shows more than one card.' })
    expect(sent).toHaveLength(1)
    expect(approvedPaths(fixture)).toEqual([])
  })

  // Producer: the run 5 card of the #2127 capture. Its two set options declare no target in the trace, so no selection of it
  // can state the decision.
  it.each(['same-title-card-en', 'same-title-card-pt'])('fails %s for a card that cannot hold the answer, sends no answer and approves nothing', async (id) => {
    const card = { ...streams.run5.card, block: { ...streams.run5.card.block, expiresAtUtc: '2026-11-14T04:43:10Z' } }
    const { verdict, sent, fixture } = await attempt(id, { replies: [turnOf({ parts: [card] }), answered[1]], traces: [{ calls: [] }], ...setup })
    expect(verdict).toMatchObject({ pass: false, reason: 'The card lets the person select 0 of the 6 same-title children.' })
    expect(sent).toHaveLength(1)
    expect(approvedPaths(fixture)).toEqual([])
  })

  it.each(['same-title-card-en', 'same-title-card-pt'])('fails %s when the answer turn loses the deletion, and approves nothing', async (id) => {
    const { verdict, sent, fixture } = await attempt(id, { replies: [answered[0], previewTurn(renaming([0, 1, 2, 3]))], ...setup })
    expect(sent).toHaveLength(2)
    expect(verdict).toMatchObject({ pass: false, reason: expect.stringContaining('The preview does not delete exactly the records of the request.') })
    expect(approvedPaths(fixture)).toEqual([])
  })
})

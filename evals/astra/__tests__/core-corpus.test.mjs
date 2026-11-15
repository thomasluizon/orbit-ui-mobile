import { expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { parse } from 'yaml'
import { LOCALES, MUST_PASS_ATTEMPTS, OTHER_ATTEMPTS, PHRASINGS_PER_LOCALE, attemptsFor, coreCases, corpusDigest, digestOf, situations } from '../core/corpus.mjs'
import { mustPass, other } from '../core/tests.mjs'

const cases = coreCases()
const configuration = (name) => parse(readFileSync(new URL(`../core/${name}.promptfooconfig.yaml`, import.meta.url), 'utf8'))
const fixtureRecords = { pro: ['water', 'walk'], composition: ['water', 'walk'], 'duplicate-titles': ['first', 'second'],
  'same-title-children': ['parent', 'children', 'walk'] }
// The kinds and fields that the saved state readback reads (core/outcome.mjs savedField): a create is read with its
// habit detail, an update from the snapshot row.
const snapshotFields = ['title', 'due_date', 'frequency_unit', 'frequency_quantity']
const readBack = (change) => ['delete', 'log'].includes(change.kind)
  || (change.kind === 'create' && Object.keys(change.fields).every((field) => [...snapshotFields, 'due_time'].includes(field)))
  || (change.kind === 'update' && Object.keys(change.fields).every((field) => snapshotFields.includes(field)))
const ownerRequest = 'eu tenho 7 habitos chamados Water - 710ml deleta dois desses, e os outros 4 coloca Water - 1.18L'
const repository = (path) => readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8')

it('holds 21 situations, each in 3 phrasings, each in English and pt-BR', () => {
  expect(situations).toHaveLength(21)
  expect(cases).toHaveLength(126)
  expect(cases).toHaveLength(situations.length * PHRASINGS_PER_LOCALE * LOCALES.length)
  const ids = cases.map(({ metadata }) => metadata.id)
  expect(new Set(ids).size).toBe(cases.length)
  // promptfoo --filter-metadata matches a substring, so no case ID may be a part of another case ID, and a situation ID
  // selects only its own cases.
  expect(ids.filter((id) => ids.some((other) => other !== id && other.includes(id)))).toEqual([])
  for (const situation of situations) expect(ids.filter((id) => id.includes(situation.id))).toHaveLength(PHRASINGS_PER_LOCALE * LOCALES.length)
  for (const situation of situations) {
    expect(Object.keys(situation.phrasings).toSorted()).toEqual(LOCALES.toSorted())
    for (const locale of LOCALES) {
      expect(situation.phrasings[locale]).toHaveLength(PHRASINGS_PER_LOCALE)
      expect(new Set(situation.phrasings[locale]).size).toBe(PHRASINGS_PER_LOCALE)
    }
  }
})

it('runs the must-pass cases at k=3 and the other cases at k=1, as two runs', () => {
  expect([MUST_PASS_ATTEMPTS, OTHER_ATTEMPTS]).toEqual([3, 1])
  expect(mustPass()).toHaveLength(90)
  expect(other()).toHaveLength(36)
  for (const { metadata } of cases) expect(metadata.k).toBe(attemptsFor(metadata.mustPass))
  expect(configuration('must-pass')).toMatchObject({ tests: 'file://tests.mjs:mustPass', evaluateOptions: { repeat: MUST_PASS_ATTEMPTS, maxConcurrency: 1 } })
  expect(configuration('other')).toMatchObject({ tests: 'file://tests.mjs:other', evaluateOptions: { repeat: OTHER_ATTEMPTS, maxConcurrency: 1 } })
})

it('holds each owner turn on record as a must-pass case, word for word in pt-BR', () => {
  const first = (id) => situations.find((situation) => situation.id === id).phrasings['pt-BR'][0]
  expect(first('owner-water-request')).toBe(ownerRequest)
  expect(first('owner-water-run-5')).toBe(ownerRequest)
  expect(first('owner-water-choice')).toBe('4 primeiros')
  expect(first('owner-water-typed-answer')).toBe('ja respondi isos, eu falei pra manter os 4 primeiros, isso significa q é pra excluir os 2 ultimos')
  expect(first('owner-water-confirmation')).toBe('Sim, últimos 2')
  expect(first('owner-water-full-repeat')).toBe('???? caralho cara, eu pedi uma coisa muito simples 2 ultimos habitos vc deleta 4 primeiros habitos chamados water 710ml vc muda pra Water - 1.18L qual a dificuldade?')
  expect(first('owner-image-create')).toBe('cria pra mim')
  const owner = situations.filter((situation) => situation.family === 'owner-turns')
  expect(owner).toHaveLength(7)
  expect(owner.every((situation) => situation.mustPass)).toBe(true)
})

// The #2127 capture, run 5: the owner's Water request got a list card that logs habits, no question and no preview.
it('holds the run-5 owner request as a must-pass situation of its own, in both locales', () => {
  const [request, runFive] = ['owner-water-request', 'owner-water-run-5'].map((id) => situations.find((situation) => situation.id === id))
  expect(runFive).toMatchObject({ family: 'owner-turns', mustPass: true, fixture: 'same-title-children', platform: 'mobile' })
  expect(runFive.expected).toEqual(request.expected)
  expect(runFive.answer).toEqual(request.answer)
  expect(runFive.phrasings.en[0]).toBe(request.phrasings.en[0])
  for (const locale of LOCALES) {
    expect(runFive.phrasings[locale]).toHaveLength(PHRASINGS_PER_LOCALE)
    for (const phrasing of runFive.phrasings[locale].slice(1)) expect(request.phrasings[locale]).not.toContain(phrasing)
  }
  expect(cases.filter(({ metadata }) => metadata.situation === 'owner-water-run-5').map(({ metadata }) => metadata.k)).toEqual(Array(6).fill(3))
})

it('sends each later owner turn after the recorded messages that came before it', () => {
  for (const [id, messages, last] of [['owner-water-choice', 2, 'Eu excluo os dois últimos ou os dois primeiros? Mantém quais?'],
    ['owner-water-confirmation', 6, 'Você quer excluir os 2 últimos?'],
    ['owner-water-full-repeat', 8, 'Qual hábito você quer usar para “Water 710ml”?']]) {
    const { prefix, lead } = cases.find(({ metadata }) => metadata.id === `${id}-pt-BR-1`).vars.core
    expect(lead).toEqual([])
    expect(prefix).toHaveLength(messages)
    expect(prefix.map(({ role }) => role)).toEqual(Array.from({ length: messages }, (_, index) => index % 2 ? 'assistant' : 'user'))
    expect(prefix.at(-1).content).toBe(last)
  }
})

// Class e is context that the server holds for one conversation, so one class e situation sends the earlier owner
// messages live in the conversation of the case, and no recorded assistant message stands in for the server.
it('drives one class e owner turn live in one conversation', () => {
  const live = situations.filter((situation) => situation.prefix?.live)
  expect(live.map(({ id, defectClass, mustPass }) => ({ id, defectClass, mustPass }))).toEqual([{ id: 'owner-water-typed-answer', defectClass: 'e', mustPass: true }])
  for (const [locale, lead] of [['pt-BR', [ownerRequest, '4 primeiros']],
    ['en', ['i have 7 habits called Water - 710ml delete two of them, and change the other 4 to Water - 1.18L', 'first 4']]]) {
    const { vars, metadata } = cases.find(({ metadata: { id } }) => id === `owner-water-typed-answer-${locale}-1`)
    expect(vars.core.lead).toEqual(lead)
    expect(vars.core.prefix).toEqual([])
    expect(metadata.maxQuestions).toBe(lead.length)
  }
})

it('guards each defect class with a must-pass situation, and holds the same-title family', () => {
  const guarded = new Set(situations.filter((situation) => situation.mustPass).map((situation) => situation.defectClass))
  expect([...guarded].toSorted()).toEqual(['a1', 'a2', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l'])
  const family = situations.filter((situation) => situation.family === 'same-title')
  expect(family).toHaveLength(6)
  expect(family.every((situation) => situation.fixture === 'same-title-children' && !situation.mustPass)).toBe(true)
})

it.each(situations)('declares a gradable outcome for $id', (situation) => {
  const { expected, answer, fixture } = situation
  const names = fixtureRecords[fixture]
  expect(names).toBeDefined()
  if (expected.read) {
    expect(expected.changes).toBeUndefined()
    for (const locale of LOCALES) expect(expected.read[locale]).toMatch(/asks no question/u)
    return
  }
  expect(expected.changes.length).toBeGreaterThan(0)
  for (const change of expected.changes) {
    expect(readBack(change), `${change.kind} has a saved state readback`).toBe(true)
    const { targets } = change
    expect(change.kind === 'create').toBe(targets === undefined)
    for (const name of targets ? [targets.record, ...(targets.records ?? []), targets.of].filter(Boolean) : []) expect(names).toContain(name)
  }
  // A live situation types the earlier owner messages first; an answer is needed only for a question past them.
  const typedFirst = cases.find(({ metadata }) => metadata.situation === situation.id).vars.core.lead.length
  const asks = (expected.questions?.max ?? 0) > typedFirst
  expect(Boolean(answer)).toBe(asks)
  if (answer) for (const locale of LOCALES) expect(answer.text[locale].length).toBeGreaterThan(0)
})

it('grades with a model only the text of a read answer', () => {
  for (const test of cases) {
    const read = Boolean(test.vars.core.expected.read)
    expect((test.assert ?? []).map(({ type, metric }) => `${type}:${metric}`)).toEqual(read ? ['llm-rubric:readAnswer'] : [])
    expect(test.vars.rubric.length > 0).toBe(read)
  }
  for (const name of ['must-pass', 'other']) {
    expect(configuration(name).defaultTest.assert).toEqual([{ type: 'javascript', value: 'file://outcome.mjs:outcome', metric: 'outcome' }])
  }
})

it('writes each pt-BR phrasing as a Brazilian says it, never as a translation of "should be called"', () => {
  const translated = cases.filter(({ metadata, vars }) => metadata.locale === 'pt-BR' && /\bdevem? se chamar\b/u.test(vars.input))
  expect(translated.map(({ metadata }) => metadata.id)).toEqual([])
})

// Two reports compare only when they measured the same cases: the phrasing, the recorded messages, the expected
// outcome, the answer of the person and the image.
it('changes the corpus digest when a phrasing, an expected outcome, an answer or the image changes', () => {
  const changed = (change, image) => { const copy = structuredClone(cases); change(copy.find(({ metadata }) => metadata.id === 'owner-water-request-pt-BR-1')); return digestOf(copy, image) }
  expect(digestOf(structuredClone(cases))).toBe(corpusDigest)
  const digests = [
    changed((test) => { test.vars.input = `${test.vars.input}.` }),
    changed((test) => { test.vars.core.expected.questions.max = 2 }),
    changed((test) => { test.vars.core.expected.changes[1].fields.title = 'Water - 1L' }),
    changed((test) => { test.vars.core.answer.text['pt-BR'] = 'Exclui os 2 primeiros' }),
    changed((test) => { test.metadata.mustPass = false }),
    changed(() => {}, () => Buffer.from('another image')),
  ]
  expect(digests).not.toContain(corpusDigest)
  expect(new Set(digests).size).toBe(digests.length)
})

it('gives the same corpus digest on each machine', () => {
  const elsewhere = structuredClone(cases).map((test) => ({ ...test,
    assert: test.assert?.map((assertion) => ({ ...assertion, transform: 'file:///another/machine/evals/astra/grading-input.mjs' })) }))
  expect(elsewhere.some((test) => test.assert)).toBe(true)
  expect(digestOf(elsewhere)).toBe(corpusDigest)
})

// The release spec holds the owner's ceiling for the launch gate run; the skill and TESTING.md carry the same figure.
it('keeps the 2 USD ceiling of the launch gate run in the skill and in TESTING.md', () => {
  expect(repository('.claude/specs/orbit-prod-release.md')).toMatch(/eval spend ceiling is 2 USD for that run/u)
  for (const path of ['.claude/skills/astra-eval/SKILL.md', 'TESTING.md']) expect(repository(path), path).toMatch(/2 USD/u)
})

it('keeps the single rerun of the failed cases after a fix as a merged gate verdict, in the skill and in TESTING.md', () => {
  for (const path of ['.claude/skills/astra-eval/SKILL.md', 'TESTING.md']) {
    expect(repository(path), path).toMatch(/--rerun/u)
    expect(repository(path), path).not.toMatch(/beside the first report/u)
  }
})

// A grader limit is final on its build. What the evidence keeps differs by kind: only a preview limit stores the held
// previews for an offline regrade, and no kind clears without the rerun on a later API commit.
it('states for each kind of grader limit what the evidence keeps and what clears it, in the skill and in TESTING.md', () => {
  for (const path of ['.claude/skills/astra-eval/SKILL.md', 'TESTING.md']) {
    const text = repository(path).replace(/\s+/gu, ' ')
    for (const kind of ['A preview limit', 'A readback limit', 'A card limit']) expect(text, `${path}: ${kind}`).toContain(kind)
    expect(text, path).toContain('Each kind clears only through `--rerun` on a later API commit of the pull request')
    expect(text, path).not.toMatch(/extend the grader and regrade them offline/u)
  }
})

// Producer: orbit-api ChatController.MaxChatRequestBytes limits the whole chat form to 10 MB.
it('holds the image of the owner image turn as a PNG inside the chat request limit', () => {
  const image = readFileSync(new URL('../core/fixtures/cinema-ticket.png', import.meta.url))
  expect(image.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  expect(image.length).toBeLessThan(10 * 1024 * 1024)
  expect(situations.filter((situation) => situation.image).map((situation) => situation.id)).toEqual(['owner-image-create'])
})

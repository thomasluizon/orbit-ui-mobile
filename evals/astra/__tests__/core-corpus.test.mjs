import { afterEach, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { parse } from 'yaml'
import { EQUAL_MODEL_INPUT_ATTEMPTS, LOCALES, MUST_PASS_ATTEMPTS, MUST_PASS_K_VARIABLE, OTHER_ATTEMPTS, PHRASINGS_PER_LOCALE, attemptsFor, coreCases, coreDescriptors,
  corpusDigest, corpusDigestFor, digestOf, mustPassKOf, situations } from '../core/corpus.mjs'
import { mustPass, other } from '../core/tests.mjs'

const cases = coreCases()
const configuration = (name) => parse(readFileSync(new URL(`../core/${name}.promptfooconfig.yaml`, import.meta.url), 'utf8'))
const fixtureRecords = { pro: ['water', 'walk'], composition: ['water', 'walk'], 'duplicate-titles': ['first', 'second'],
  'same-title-children': ['parent', 'children', 'walk'] }
const ownerRequest = 'eu tenho 7 habitos chamados Water - 710ml deleta dois desses, e os outros 4 coloca Water - 1.18L'
const repository = (path) => readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8')
afterEach(() => { vi.unstubAllEnvs() })

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
  for (const { metadata, options } of cases) {
    expect(metadata.k).toBe(attemptsFor(metadata.mustPass))
    expect(options).toEqual({ repeat: metadata.k })
  }
  // Producer: promptfoo 0.125.1 appendRunEvalOptionsForTestCase repeats a test `testCase.options.repeat` times, and a
  // global repeat only where a test names none. No config holds a global repeat that could disagree with the k of a case.
  for (const [name, tests] of [['must-pass', 'file://tests.mjs:mustPass'], ['other', 'file://tests.mjs:other']]) {
    expect(configuration(name)).toMatchObject({ tests, evaluateOptions: { maxConcurrency: 1 } })
    expect(configuration(name).evaluateOptions).not.toHaveProperty('repeat')
  }
  expect(mustPass().map(({ options }) => options.repeat)).toEqual(Array(90).fill(MUST_PASS_ATTEMPTS))
  expect(other().map(({ options }) => options.repeat)).toEqual(Array(36).fill(OTHER_ATTEMPTS))
})

it('runs the must-pass cases at k=3 unless the run names k=1 in ORBIT_EVAL_MUST_PASS_K', () => {
  expect(MUST_PASS_K_VARIABLE).toBe('ORBIT_EVAL_MUST_PASS_K')
  expect([mustPassKOf({}), mustPassKOf({ ORBIT_EVAL_MUST_PASS_K: '3' }), mustPassKOf({ ORBIT_EVAL_MUST_PASS_K: '1' })]).toEqual([3, 3, 1])
  for (const named of ['2', '', ' 1', 'one', '0']) {
    expect(() => mustPassKOf({ ORBIT_EVAL_MUST_PASS_K: named }))
      .toThrow(`ORBIT_EVAL_MUST_PASS_K is "${named}"; name 3, the default, or 1, only for a change whose model input equals the model input of main.`)
  }
  vi.stubEnv('ORBIT_EVAL_MUST_PASS_K', '1')
  expect(EQUAL_MODEL_INPUT_ATTEMPTS).toBe(1)
  expect(mustPass().map(({ metadata, options }) => [metadata.k, options.repeat])).toEqual(Array(90).fill([1, 1]))
  expect(other().map(({ metadata, options }) => [metadata.k, options.repeat])).toEqual(Array(36).fill([1, 1]))
  vi.stubEnv('ORBIT_EVAL_MUST_PASS_K', '2')
  expect(() => mustPass()).toThrow('ORBIT_EVAL_MUST_PASS_K is "2"')
  expect(() => other()).toThrow('ORBIT_EVAL_MUST_PASS_K is "2"')
  expect(() => coreCases(situations, 2)).toThrow('The must-pass cases run at k=3 or k=1, never at k=2.')
})

// A k=1 run and a k=3 run measure two corpora. The digest of the default k stays the digest of the cases alone, so the
// windows of the k=3 baseline of main written before the k setting still merge.
it('gives a k=1 run its own corpus digest and keeps the digest of the k=3 run', () => {
  expect(corpusDigestFor(MUST_PASS_ATTEMPTS)).toBe(corpusDigest)
  expect(corpusDigestFor(EQUAL_MODEL_INPUT_ATTEMPTS)).not.toBe(corpusDigest)
  expect(digestOf(cases.map(({ options, ...withoutRepeat }) => withoutRepeat))).toBe(corpusDigest)
  expect(coreDescriptors(1).filter(({ mustPass: required }) => required).map(({ k }) => k)).toEqual(Array(90).fill(1))
  expect(coreDescriptors(1).filter(({ mustPass: required }) => !required)).toEqual(coreDescriptors().filter(({ mustPass: required }) => !required))
})

// The documents that state pass^3 state when k=1 holds, so that no operator reads k=1 as a cheaper k=3.
it('states in the skill and in TESTING.md that k=1 holds only for a change with equal model input', () => {
  for (const path of ['.claude/skills/astra-eval/SKILL.md', 'TESTING.md']) {
    const text = repository(path).replace(/\s+/gu, ' ')
    expect(text, path).toContain('ORBIT_EVAL_MUST_PASS_K=1')
    expect(text, path).toMatch(/k=1 only for a change whose model input equals the model input of `main`/u)
    expect(text, path).toMatch(/pull request body of that change says why its model input is equal/u)
    expect(text, path).toMatch(/merge refuses a k=1 window, rerun or baseline in a k=3 verdict, and a k=3 one in a k=1 verdict/u)
  }
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

// The saved state readback reads a delete and a log, a create of the fields that the snapshot row or the habit detail
// holds, and an update of the fields that the snapshot row holds (core/outcome.mjs savedField). The core set loads only
// when each expected change is one of these, so no live turn spends on a case that the grader cannot read back.
it.each([
  ['an update of a field that only the habit detail holds', { kind: 'update', targets: { record: 'walk' }, fields: { due_time: { time: '10:00' } } }, 'update of due_time'],
  ['a create of a field that no saved record names', { kind: 'create', fields: { title: 'Read', emoji: 'book' } }, 'create of emoji'],
  ['a kind that leaves no mark in the snapshot', { kind: 'skip', targets: { record: 'walk' } }, 'skip'],
])('refuses to load a situation that expects %s', (_name, change, unread) => {
  const situation = structuredClone(situations.find(({ id }) => id === 'owner-water-request'))
  situation.expected.changes.push(change)
  expect(() => coreCases([situation])).toThrow(`Situation owner-water-request expects a ${unread}, and the grader cannot read back its saved state.`)
  situation.expected.changes.pop()
  expect(coreCases([situation])).toHaveLength(PHRASINGS_PER_LOCALE * LOCALES.length)
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
    expect(repository(path).replace(/\s+/gu, ' '), path).toContain('`--rerun` declares which windows belong to a later build')
    expect(repository(path), path).not.toMatch(/beside the first report/u)
  }
})

// The Astra eval Action is deleted: the live runs of the core set and of the launch corpus start only from a local checkout.
it('runs the live gate only from a local checkout, in the skill and in TESTING.md', () => {
  for (const path of ['.claude/skills/astra-eval/SKILL.md', 'TESTING.md']) {
    const text = repository(path).replace(/\s+/gu, ' ')
    expect(text, path).not.toMatch(/manual dispatch|manual-only triggering|Astra eval` workflow|The Action|Actions > Astra eval/u)
    expect(text, path).toMatch(/only live run/u)
  }
})

// A grader limit is final on its build. What the evidence keeps differs by kind: only a preview limit stores the held
// previews for an offline regrade, and no kind clears without the rerun on a later API commit. The core set refuses a
// change that the grader cannot read back when it loads, so no readback limit exists.
it('states for each kind of grader limit what the evidence keeps and what clears it, in the skill and in TESTING.md', () => {
  for (const path of ['.claude/skills/astra-eval/SKILL.md', 'TESTING.md']) {
    const text = repository(path).replace(/\s+/gu, ' ')
    for (const kind of ['A preview limit', 'A card limit']) expect(text, `${path}: ${kind}`).toContain(kind)
    expect(text, path).not.toMatch(/readback limit|cannot read back a saved/u)
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

import { expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { parse } from 'yaml'
import { LOCALES, MUST_PASS_ATTEMPTS, OTHER_ATTEMPTS, PHRASINGS_PER_LOCALE, attemptsFor, coreCases, situations } from '../core/corpus.mjs'
import { mustPass, other } from '../core/tests.mjs'

const cases = coreCases()
const configuration = (name) => parse(readFileSync(new URL(`../core/${name}.promptfooconfig.yaml`, import.meta.url), 'utf8'))
const fixtureRecords = { pro: ['water', 'walk'], composition: ['water', 'walk'], 'duplicate-titles': ['first', 'second'],
  'same-title-children': ['parent', 'children', 'walk'] }
// The kinds and fields that the saved state readback reads (core/outcome.mjs gradeSavedState).
const readBack = (change) => ['delete', 'log', 'create'].includes(change.kind)
  || (change.kind === 'update' && typeof change.fields.title === 'string')

it('holds 20 situations, each in 3 phrasings, each in English and pt-BR', () => {
  expect(situations).toHaveLength(20)
  expect(cases).toHaveLength(20 * PHRASINGS_PER_LOCALE * LOCALES.length)
  const ids = cases.map(({ metadata }) => metadata.id)
  expect(new Set(ids).size).toBe(cases.length)
  // promptfoo --filter-metadata matches a substring, so no case ID may be a part of another case ID.
  expect(ids.filter((id) => ids.some((other) => other !== id && other.includes(id)))).toEqual([])
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
  expect(mustPass()).toHaveLength(84)
  expect(other()).toHaveLength(36)
  for (const { metadata } of cases) expect(metadata.k).toBe(attemptsFor(metadata.mustPass))
  expect(configuration('must-pass')).toMatchObject({ tests: 'file://tests.mjs:mustPass', evaluateOptions: { repeat: MUST_PASS_ATTEMPTS, maxConcurrency: 1 } })
  expect(configuration('other')).toMatchObject({ tests: 'file://tests.mjs:other', evaluateOptions: { repeat: OTHER_ATTEMPTS, maxConcurrency: 1 } })
})

it('holds each owner turn on record as a must-pass case, word for word in pt-BR', () => {
  const first = (id) => situations.find((situation) => situation.id === id).phrasings['pt-BR'][0]
  expect(first('owner-water-request')).toBe('eu tenho 7 habitos chamados Water - 710ml deleta dois desses, e os outros 4 coloca Water - 1.18L')
  expect(first('owner-water-choice')).toBe('4 primeiros')
  expect(first('owner-water-typed-answer')).toBe('ja respondi isos, eu falei pra manter os 4 primeiros, isso significa q é pra excluir os 2 ultimos')
  expect(first('owner-water-confirmation')).toBe('Sim, últimos 2')
  expect(first('owner-water-full-repeat')).toBe('???? caralho cara, eu pedi uma coisa muito simples 2 ultimos habitos vc deleta 4 primeiros habitos chamados water 710ml vc muda pra Water - 1.18L qual a dificuldade?')
  expect(first('owner-image-create')).toBe('cria pra mim')
  const owner = situations.filter((situation) => situation.family === 'owner-turns')
  expect(owner).toHaveLength(6)
  expect(owner.every((situation) => situation.mustPass)).toBe(true)
})

it('sends each later owner turn after the recorded messages that came before it', () => {
  for (const [id, messages, last] of [['owner-water-choice', 2, 'Eu excluo os dois últimos ou os dois primeiros? Mantém quais?'],
    ['owner-water-typed-answer', 4, 'Quais 2 dos 6 hábitos você quer excluir?'], ['owner-water-confirmation', 6, 'Você quer excluir os 2 últimos?'],
    ['owner-water-full-repeat', 8, 'Qual hábito você quer usar para “Water 710ml”?']]) {
    const { prefix } = cases.find(({ metadata }) => metadata.id === `${id}-pt-BR-1`).vars.core
    expect(prefix).toHaveLength(messages)
    expect(prefix.map(({ role }) => role)).toEqual(Array.from({ length: messages }, (_, index) => index % 2 ? 'assistant' : 'user'))
    expect(prefix.at(-1).content).toBe(last)
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
  const asks = (expected.questions?.max ?? 0) > 0
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

// Producer: orbit-api ChatController.MaxChatRequestBytes limits the whole chat form to 10 MB.
it('holds the image of the owner image turn as a PNG inside the chat request limit', () => {
  const image = readFileSync(new URL('../core/fixtures/cinema-ticket.png', import.meta.url))
  expect(image.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  expect(image.length).toBeLessThan(10 * 1024 * 1024)
  expect(situations.filter((situation) => situation.image).map((situation) => situation.id)).toEqual(['owner-image-create'])
})

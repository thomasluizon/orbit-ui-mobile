import { expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { parse } from 'yaml'
import { behavior } from '../assertions.mjs'
import { matchesArguments, matchesOperation } from '../operation-matcher.mjs'
import { dateOffset } from '../fixtures/reset.mjs'
import parseResponse from '../response.mjs'
import { toolCall, chatResponse } from './fixtures/producer.mjs'

const corpus = parse(readFileSync(new URL('../composition-scenarios.yaml', import.meta.url), 'utf8'))
const captured = JSON.parse(readFileSync(new URL('./fixtures/medical-titles.json', import.meta.url), 'utf8'))
const scenario = corpus.find((entry) => entry.metadata.id === 'composition-medical-batch-pt-BR')
const expectations = JSON.parse(JSON.stringify(scenario.vars.expectations).replace(/\{accountDate([+]\d+)\}/g,
  (_, offset) => dateOffset('2026-10-29', Number(offset))))
const operation = expectations.required[0]
const grade = (arguments_) => behavior(parseResponse(chatResponse('request', [
  toolCall(captured.name, arguments_, captured.resultStatus),
]), '', { response: { status: 200, headers: { 'x-orbit-request-id': 'request' } } }),
{ vars: { ...scenario.vars, expectations, evalRequestId: 'request' } })

it('accepts the captured medical batch with the person\'s pt-BR titles through the behavior gate', () => {
  expect(grade(captured.arguments)).toMatchObject({ pass: true })
})

it.each(['Não ir pro Muay Thai', 'Não ir para o Muay Thai', 'Não ir ao Muay Thai'])(
  'accepts %s in every flat and nested matcher and correction setup', (title) => {
    const flat = structuredClone(captured.arguments)
    flat.habits[3].title = title
    const nested = structuredClone(flat)
    nested.habits[1].sub_habits = nested.habits.splice(2)
    for (const vitamin of ['Parar com multivitamínico', 'Não tomar multivitamínico']) {
      flat.habits[2].title = vitamin
      nested.habits[1].sub_habits[0].title = vitamin
      expect(matchesArguments(flat, operation.arguments)).toBe(true)
      expect(matchesArguments(flat, operation.argumentsAnyOf[0])).toBe(true)
      expect(matchesArguments(nested, operation.argumentsAnyOf[1])).toBe(true)
      for (const arguments_ of [flat, nested]) {
        expect(matchesOperation({ ...captured, arguments: arguments_ }, operation)).toBe(true)
        expect(grade(arguments_).pass).toBe(true)
      }
    }
    const correction = corpus.find((entry) => entry.metadata.id === 'composition-medical-correction-pt-BR')
    expect(correction.vars.setup.expectations).toEqual(scenario.vars.expectations)
    expect(scenario.vars.rubric).toContain('Não ir pro Muay Thai')
  },
)

it.each(['wrong title', 'reversed instruction', 'vitamin title', 'start date', 'end date', 'cadence', 'avoid habit', 'exam time', 'fasting time'])(
  'rejects %s with otherwise accepted medical titles', (failure) => {
    const changed = structuredClone(captured.arguments)
    if (failure === 'wrong title') changed.habits[3].title = 'Não ir pro futebol'
    if (failure === 'reversed instruction') changed.habits[3].title = 'Ir pro Muay Thai'
    if (failure === 'vitamin title') changed.habits[2].title = 'Tomar multivitamínico'
    if (failure === 'start date') changed.habits[2].due_date = '2026-11-03'
    if (failure === 'end date') changed.habits[3].end_date = '2026-11-06'
    if (failure === 'cadence') changed.habits[3].frequency_unit = 'OneTime'
    if (failure === 'avoid habit') changed.habits[3].is_bad_habit = true
    if (failure === 'exam time') changed.habits[0].due_time = '16:50'
    if (failure === 'fasting time') changed.habits[4].due_end_time = '14:30'
    expect(grade(changed).pass).toBe(false)
  },
)

import { expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { outcome } from '../client-path.mjs'
import { readCorpus } from '../grade-method.mjs'
import { dateOffset } from '../fixtures/reset.mjs'
import { preview } from './fixtures/producer.mjs'

const corpus = readCorpus()
const captured = JSON.parse(readFileSync(new URL('./fixtures/medical-titles.json', import.meta.url), 'utf8'))
const scenario = corpus.find((entry) => entry.metadata.id === 'composition-medical-batch-pt-BR')
const vars = { ...JSON.parse(JSON.stringify(scenario.vars).replace(/\{accountDate([+]\d+)\}/g,
  (_, offset) => dateOffset('2026-10-29', Number(offset)))), accountDate: '2026-10-29' }

// Producer: orbit-api CreationFields gives a create preview one row for each argument that holds a value, in the text
// that AgentArgumentPreview.FormatValue gives it, and a `sub_habits` row with the child drafts as its proposedValue.
const shown = (value) => typeof value === 'boolean' ? (value ? 'True' : 'False') : String(value)
function heldPreview(arguments_) {
  const template = preview().items[0]
  return { ...preview(), changeTargetCount: arguments_.habits.length, items: arguments_.habits.map((habit, index) => ({
    ...template, itemId: String(index), entityName: habit.title,
    fields: Object.entries(habit).filter(([field, value]) => value !== null && (field === 'sub_habits' || typeof value !== 'object'))
      .map(([field, value]) => ({ ...template.fields[0], entityName: habit.title, field, valueType: 'text',
        newValue: field === 'sub_habits' ? JSON.stringify(value) : shown(value), proposedValue: value })) })) }
}
const grade = (arguments_) => outcome({ turns: 1, questionsBeforePreview: 0, previews: [heldPreview(arguments_)], asked: false, written: [] }, { vars })

it('accepts the captured medical batch with the person\'s pt-BR titles through the outcome grade', () => {
  expect(grade(captured.arguments)).toMatchObject({ pass: true, reason: 'The held previews hold exactly the requested changes.' })
})

it.each(['Não ir pro Muay Thai', 'Não ir para o Muay Thai', 'Não ir ao Muay Thai'])(
  'accepts %s in the flat and the nested preview and in the correction setup', (title) => {
    const flat = structuredClone(captured.arguments)
    flat.habits[3].title = title
    const nested = structuredClone(flat)
    nested.habits[1].sub_habits = nested.habits.splice(2)
    for (const vitamin of ['Parar com multivitamínico', 'Não tomar multivitamínico']) {
      flat.habits[2].title = vitamin
      nested.habits[1].sub_habits[0].title = vitamin
      for (const arguments_ of [flat, nested]) expect(grade(arguments_)).toMatchObject({ pass: true })
    }
    const correction = corpus.find((entry) => entry.metadata.id === 'composition-medical-correction-pt-BR')
    expect(correction.vars.setup.outcome).toEqual(scenario.vars.outcome)
  },
)

it.each(['wrong title', 'reversed instruction', 'vitamin title', 'start date', 'end date', 'cadence', 'avoid habit', 'exam time', 'fasting time',
  'one more record', 'one record less'])(
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
    if (failure === 'one more record') changed.habits.push({ ...changed.habits[0], title: 'Beber água' })
    if (failure === 'one record less') changed.habits.pop()
    expect(grade(changed).pass).toBe(false)
  },
)

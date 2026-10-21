import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { PostApiHabitsBody, GetApiHabitsIdResponse, GetApiHabitsResponse } from '../src/types/__generated__/api.generated.ts'

const document = JSON.parse(readFileSync(new URL('./__fixtures__/openapi_v1-r2.json', import.meta.url), 'utf8'))
const schemas = document.components.schemas

describe('generated diff target reflects the accepted producer revision', () => {
  it.each(schemas.FrequencyUnit.anyOf[0].enum)('retains canonical frequency %s in input and output', (name) => {
    expect(PostApiHabitsBody.shape.frequencyUnit.safeParse(name).success).toBe(true)
    expect(GetApiHabitsIdResponse.shape.frequencyUnit.safeParse(name).success).toBe(true)
  })

  it.each(schemas.DayOfWeek.anyOf[0].enum)('retains canonical day %s in input and output', (name) => {
    expect(PostApiHabitsBody.shape.days.safeParse([name]).success).toBe(true)
    expect(GetApiHabitsIdResponse.shape.days.safeParse([name]).success).toBe(true)
  })

  it.each(['day', '\u2003WEEK\u2003', 'Day,Month', '+0002147483647', '-0002147483648'])('keeps binder-only frequency %s out of responses', (value) => {
    expect(PostApiHabitsBody.shape.frequencyUnit.safeParse(value).success).toBe(true)
    expect(GetApiHabitsIdResponse.shape.frequencyUnit.safeParse(value).success).toBe(false)
  })

  it.each([-2147483648, 2147483647, 99])('retains undefined Int32 fallback %s', (value) => {
    expect(PostApiHabitsBody.shape.frequencyUnit.safeParse(value).success).toBe(true)
    expect(GetApiHabitsIdResponse.shape.frequencyUnit.safeParse(value).success).toBe(true)
  })

  it.each([-2147483649, 2147483648, '2147483648', '-2147483649', '1.0', 'unknown'])('rejects out-of-contract frequency %s', (value) => {
    expect(PostApiHabitsBody.shape.frequencyUnit.safeParse(value).success).toBe(false)
    expect(GetApiHabitsIdResponse.shape.frequencyUnit.safeParse(value).success).toBe(false)
  })

  it.each(['SameDay', 'DayBefore', -2147483648, 2147483647])('retains canonical or numeric reminder output %s', (when) => {
    const reminder = [{ when, time: '08:00:00' }]
    expect(PostApiHabitsBody.shape.scheduledReminders.safeParse(reminder).success).toBe(true)
    expect(GetApiHabitsIdResponse.shape.scheduledReminders.safeParse(reminder).success).toBe(true)
  })

  it.each(['same_day', 'day_before', 'sameday', ' SameDay ', 'SameDay,DayBefore', '+0001'])('preserves reminder input/output asymmetry for %s', (when) => {
    const reminder = [{ when, time: '08:00:00' }]
    expect(PostApiHabitsBody.shape.scheduledReminders.safeParse(reminder).success).toBe(true)
    expect(GetApiHabitsIdResponse.shape.scheduledReminders.safeParse(reminder).success).toBe(false)
  })

  it('preserves nullable minute reminders and distinguishes non-null scheduled reminders', () => {
    expect(PostApiHabitsBody.shape.relativeReminders.safeParse([{ minutesBefore: 15, when: null, time: null }]).success).toBe(true)
    expect(GetApiHabitsIdResponse.shape.relativeReminders.safeParse([{ minutesBefore: 15, when: null, time: null }]).success).toBe(true)
    expect(GetApiHabitsIdResponse.shape.scheduledReminders.safeParse([{ when: null, time: '08:00:00' }]).success).toBe(false)
  })

  it.each([...schemas.InstanceStatus.anyOf[0].enum, -2147483648, 2147483647])('retains instance status %s', (status) => {
    const instances = [{ date: '2026-01-01', status, logId: null }]
    expect(GetApiHabitsResponse.shape.items.element.shape.instances.safeParse(instances).success).toBe(true)
  })
})

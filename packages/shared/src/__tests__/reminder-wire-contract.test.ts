import { describe, expect, it } from 'vitest'
import {
  bulkCreateRequestSchema, bulkHabitItemSchema, calendarMonthResponseSchema,
  createHabitRequestSchema, createPaginatedSchema, createSubHabitRequestSchema,
  habitDetailChildSchema, habitDetailSchema, habitFullDetailSchema,
  habitScheduleChildSchema, habitScheduleItemSchema, relativeReminderTimeSchema,
  scheduledReminderTimeSchema, updateHabitRequestSchema,
} from '../types/habit'
import { syncChangesV2ResponseSchema } from '../types/sync'
import { buildEditHabitFormState } from '../utils/habit-form-state'
import { buildHabitDetailReminderRows, mergeHabitDetailWithScopedHabit } from '../utils/habit-detail-flow'
import { habitDetailToNormalized, normalizeHabits } from '../utils/habit-normalization'
import { normalizeHabitDetailForDrill } from '../utils/drill-navigation'
import { createMockHabit } from './factories'
import wire from '../test-support/fixtures/habit-reminder-wire.json'

const canonical = ['same_day', 'day_before']
const clocks = {
  scheduledReminders: wire.HabitDetailResponse.scheduledReminders.map((reminder, index) => ({
    ...reminder, when: canonical[index],
  })),
  relativeReminders: wire.HabitDetailResponse.relativeReminders.map((reminder, index) => ({
    ...reminder, when: canonical[index],
  })),
}

describe('serialized reminder response boundaries', () => {
  it.each([
    ['detail', habitDetailSchema, wire.HabitDetailResponse],
    ['detail child', habitDetailChildSchema, wire.HabitChildResponse],
    ['list', habitScheduleItemSchema, wire.HabitScheduleItem],
    ['list child', habitScheduleChildSchema, wire.HabitScheduleChildItem],
  ] as const)('normalizes both reminder objects and cases in %s', (_name, schema, response) => {
    expect(schema.parse(response)).toMatchObject(clocks)
    expect(schema.parse({ ...response, ...clocks })).toMatchObject(clocks)
  })

  it('normalizes paginated, calendar and full detail with recursive children', () => {
    const child = { ...wire.HabitChildResponse, children: [wire.HabitChildResponse] }
    const detail = habitFullDetailSchema.parse({
      ...wire.HabitFullDetailResponse,
      habit: { ...wire.HabitDetailResponse, children: [child] },
    })
    expect(detail.habit).toMatchObject(clocks)
    expect(detail.habit.children[0]).toMatchObject(clocks)
    expect(detail.habit.children[0]?.children[0]).toMatchObject(clocks)
    const list = createPaginatedSchema(habitScheduleItemSchema).parse(wire['PaginatedResponse`1'])
    expect(list.items[0]).toMatchObject(clocks)
    expect(calendarMonthResponseSchema.parse(wire.CalendarMonthResponse).habits[0]).toMatchObject(clocks)
  })

  it('preserves child reminder values through list normalization', () => {
    const child = { ...wire.HabitScheduleChildItem, id: 'child', reminderEnabled: true }
    const parent = habitScheduleItemSchema.parse({ ...wire.HabitScheduleItem, children: [child] })
    expect(normalizeHabits([parent]).get('child')).toMatchObject({ ...clocks, reminderEnabled: true })
  })

  it.each([false, true])('retains decoded clocks and own-detail authority with populated relationships: %s', (populated) => {
    const tags = [{ id: 'tag', name: 'Tag', color: '#123456' }]
    const linkedGoals = [{ id: 'goal', title: 'Goal' }]
    const ownFields = {
      tags: populated ? tags : [],
      linkedGoals: populated ? linkedGoals : [],
      slipAlertEnabled: populated,
    }
    const child = { ...wire.HabitChildResponse, id: 'child', tags: ownFields.tags }
    const detail = habitDetailSchema.parse({
      ...wire.HabitDetailResponse,
      ...ownFields,
      children: [{ ...child, children: [{ ...child, id: 'grandchild' }] }],
    })
    const expected = { ...clocks, ...ownFields, reminderEnabled: false }
    const stale = createMockHabit({ tags, linkedGoals, slipAlertEnabled: true })
    expect(habitDetailToNormalized(detail)).toMatchObject(expected)
    expect(mergeHabitDetailWithScopedHabit(detail, stale, detail.dueDate)).toMatchObject(expected)
    const drill = normalizeHabitDetailForDrill(detail, detail.dueDate)
    expect(drill.parent).toMatchObject(expected)
    for (const parentId of [detail.id, child.id]) {
      expect(drill.childrenByParent.get(parentId)?.[0]).toMatchObject({
        ...clocks, tags: ownFields.tags, reminderEnabled: false, reminderTimes: [], slipAlertEnabled: false,
      })
    }
  })

  it('keeps previous-day labels, editor selection and clock deduplication', () => {
    const parent = habitScheduleItemSchema.parse({ ...wire.HabitScheduleItem, reminderEnabled: true })
    const habit = normalizeHabits([parent]).get(parent.id)!
    const editor = buildEditHabitFormState(habit)
    expect(editor.formValues.scheduledReminders).toEqual(clocks.scheduledReminders)
    const rows = buildHabitDetailReminderRows(habit, (key) => key)
    expect(rows.map((row) => row.label)).toEqual(['habits.detail.reminderSameDay', 'habits.detail.reminderDayBefore'])
  })

  it('normalizes scheduled sync independently of relative sync validation', () => {
    const response = structuredClone(wire.SyncChangesV2Response)
    response.habits.updated[0]!.relativeReminders = []
    expect(syncChangesV2ResponseSchema.parse(response).habits.updated[0]?.scheduledReminders)
      .toEqual(clocks.scheduledReminders)
  })

  it('normalizes both sync reminder arrays', () => {
    expect(syncChangesV2ResponseSchema.parse(wire.SyncChangesV2Response).habits.updated[0])
      .toMatchObject(clocks)
  })

  it.each(['SameDay', 'DayBefore', 'same_day', 'day_before'])('decodes only the confirmed %s spelling', (when) => {
    const expected = when === 'SameDay' || when === 'same_day' ? 'same_day' : 'day_before'
    expect(scheduledReminderTimeSchema.parse({ when, time: '08:00:00' }).when).toBe(expected)
    expect(relativeReminderTimeSchema.parse({ when, time: '08:00:00' }).when).toBe(expected)
  })

  it.each(['unknown', 'sameday', 'DAY_BEFORE', '', 0, 1, true, {}, []])('rejects unconfirmed when %j', (when) => {
    expect(scheduledReminderTimeSchema.safeParse({ when, time: '08:00:00' }).success).toBe(false)
    expect(relativeReminderTimeSchema.safeParse({ when, time: '08:00:00' }).success).toBe(false)
    const response = structuredClone(wire.SyncChangesV2Response)
    const updated = { ...response.habits.updated[0], scheduledReminders: [{ when, time: '08:00:00' }], relativeReminders: [] }
    expect(syncChangesV2ResponseSchema.safeParse({ ...response, habits: { ...response.habits, updated: [updated] } }).success).toBe(false)
  })

  it.each([null, 1, 'SameDay', {}, { when: 'SameDay' }, { when: 'SameDay', time: 1 }])('rejects malformed scheduled object %j', (reminder) => {
    expect(scheduledReminderTimeSchema.safeParse(reminder).success).toBe(false)
  })

  it('retains minute offsets, nullable fields, empty arrays and explicit disabled state', () => {
    const minute = { minutesBefore: 15, when: null, time: null }
    expect(relativeReminderTimeSchema.parse(minute)).toEqual(minute)
    expect(relativeReminderTimeSchema.parse({ minutesBefore: 15 })).toEqual({ minutesBefore: 15 })
    expect(relativeReminderTimeSchema.safeParse({ minutesBefore: '15' }).success).toBe(false)
    expect(scheduledReminderTimeSchema.safeParse({ when: null, time: '08:00:00' }).success).toBe(false)
    const response = { ...wire.HabitDetailResponse, scheduledReminders: [], relativeReminders: null, reminderEnabled: false }
    expect(habitDetailSchema.parse(response)).toMatchObject({ scheduledReminders: [], relativeReminders: null, reminderEnabled: false })
    expect(habitDetailChildSchema.parse({ ...wire.HabitChildResponse, scheduledReminders: null, relativeReminders: null }))
      .toMatchObject({ scheduledReminders: null, relativeReminders: null })
  })
})

describe('canonical reminder writes', () => {
  it.each([
    ['create', createHabitRequestSchema], ['update', updateHabitRequestSchema],
    ['sub-habit', createSubHabitRequestSchema], ['bulk item', bulkHabitItemSchema],
  ] as const)('keeps %s snake_case writes and rejects response-only spellings', (_name, schema) => {
    const request = { title: 'Reminder', isBadHabit: false, ...clocks }
    expect(schema.parse(request)).toMatchObject(clocks)
    expect(schema.safeParse({ ...request, scheduledReminders: wire.HabitDetailResponse.scheduledReminders }).success).toBe(false)
    expect(schema.safeParse({ ...request, relativeReminders: wire.HabitDetailResponse.relativeReminders }).success).toBe(false)
    const omitted = schema.parse({ title: 'Reminder', isBadHabit: false })
    expect(omitted).not.toHaveProperty('scheduledReminders')
    expect(omitted).not.toHaveProperty('relativeReminders')
    expect(schema.parse({ ...request, scheduledReminders: [], relativeReminders: [] }))
      .toMatchObject({ scheduledReminders: [], relativeReminders: [] })
  })

  it('preserves nullable bulk values and nested children', () => {
    const cleared = { title: 'Reminder', scheduledReminders: null, relativeReminders: null }
    expect(bulkHabitItemSchema.parse(cleared)).toEqual(cleared)
    const child = { title: 'Child', ...clocks }
    expect(bulkCreateRequestSchema.parse({ habits: [{ title: 'Parent', ...clocks, subHabits: [child] }] }).habits[0]?.subHabits?.[0])
      .toEqual(child)
  })
})

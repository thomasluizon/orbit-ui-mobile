import { describe, it, expect } from 'vitest'
import {
  MAX_HABIT_TITLE_LENGTH,
  MAX_HABIT_DESCRIPTION_LENGTH,
  MAX_CHECKLIST_ITEM_LENGTH,
  MAX_CHECKLIST_ITEMS,
  MAX_SUB_HABITS,
  MAX_TAG_NAME_LENGTH,
  MAX_TAGS_PER_HABIT,
  MAX_GOALS_PER_HABIT,
  MAX_HABITS_PER_GOAL,
  MAX_GOAL_TITLE_LENGTH,
  MAX_GOAL_DESCRIPTION_LENGTH,
  MAX_GOAL_UNIT_LENGTH,
  MAX_GOAL_PROGRESS_NOTE_LENGTH,
  MAX_SCHEDULED_REMINDERS,
  MAX_HABIT_LOG_NOTE_LENGTH,
} from '../validation/constants'

describe('validation constants', () => {
  it('has correct habit title max length', () => {
    expect(MAX_HABIT_TITLE_LENGTH).toBe(200)
  })

  it('has correct habit description max length', () => {
    expect(MAX_HABIT_DESCRIPTION_LENGTH).toBe(2000)
  })

  it('has correct checklist item max length', () => {
    expect(MAX_CHECKLIST_ITEM_LENGTH).toBe(500)
  })

  it('has correct max checklist items', () => {
    expect(MAX_CHECKLIST_ITEMS).toBe(50)
  })

  it('has correct max sub-habits', () => {
    expect(MAX_SUB_HABITS).toBe(20)
  })

  it('has correct tag name max length', () => {
    expect(MAX_TAG_NAME_LENGTH).toBe(50)
  })

  it('has correct max tags per habit', () => {
    expect(MAX_TAGS_PER_HABIT).toBe(5)
  })

  it('has correct max goals per habit', () => {
    expect(MAX_GOALS_PER_HABIT).toBe(10)
  })

  it('has correct max habits per goal', () => {
    expect(MAX_HABITS_PER_GOAL).toBe(20)
  })

  it('has correct goal title max length', () => {
    expect(MAX_GOAL_TITLE_LENGTH).toBe(200)
  })

  it('has correct goal description max length', () => {
    expect(MAX_GOAL_DESCRIPTION_LENGTH).toBe(500)
  })

  it('has correct goal unit max length', () => {
    expect(MAX_GOAL_UNIT_LENGTH).toBe(50)
  })

  it('has correct goal progress note max length', () => {
    expect(MAX_GOAL_PROGRESS_NOTE_LENGTH).toBe(500)
  })

  it('has correct max scheduled reminders', () => {
    expect(MAX_SCHEDULED_REMINDERS).toBe(5)
  })

  it('has correct habit log note max length', () => {
    expect(MAX_HABIT_LOG_NOTE_LENGTH).toBe(500)
  })

  it('all constants are positive numbers', () => {
    const constants = [
      MAX_HABIT_TITLE_LENGTH,
      MAX_HABIT_DESCRIPTION_LENGTH,
      MAX_CHECKLIST_ITEM_LENGTH,
      MAX_CHECKLIST_ITEMS,
      MAX_SUB_HABITS,
      MAX_TAG_NAME_LENGTH,
      MAX_TAGS_PER_HABIT,
      MAX_GOALS_PER_HABIT,
      MAX_HABITS_PER_GOAL,
      MAX_GOAL_TITLE_LENGTH,
      MAX_GOAL_DESCRIPTION_LENGTH,
      MAX_GOAL_UNIT_LENGTH,
      MAX_GOAL_PROGRESS_NOTE_LENGTH,
      MAX_SCHEDULED_REMINDERS,
      MAX_HABIT_LOG_NOTE_LENGTH,
    ]
    for (const c of constants) {
      expect(c).toBeGreaterThan(0)
    }
  })
})

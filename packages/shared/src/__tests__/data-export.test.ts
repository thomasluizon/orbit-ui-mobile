import { describe, it, expect } from 'vitest'
import { userDataExportSchema } from '../types/data-export'

const validExport = {
  exportedAtUtc: '2026-06-04T10:00:00Z',
  account: {
    name: 'Ada',
    email: 'ada@example.com',
    createdAtUtc: '2026-01-01T00:00:00Z',
    plan: 'pro',
  },
  settings: {
    timeZone: 'America/Sao_Paulo',
    language: 'en',
    weekStartDay: 1,
    themePreference: 'dark',
    colorScheme: 'blue',
    aiMemoryEnabled: true,
    aiSummaryEnabled: false,
  },
  habits: [
    {
      id: '11111111-1111-1111-1111-111111111111',
      title: 'Meditate',
      description: null,
      emoji: null,
      isBadHabit: false,
      isGeneral: false,
      dueDate: '2026-06-04',
      endDate: null,
      frequencyUnit: 'Day',
      frequencyQuantity: 1,
      days: ['Monday'],
      checklistItems: [{ text: 'Breathe', isChecked: false }],
      createdAtUtc: '2026-01-02T00:00:00Z',
      logs: [
        {
          date: '2026-06-03',
          value: 1,
          note: null,
          createdAtUtc: '2026-06-03T08:00:00Z',
        },
      ],
    },
  ],
  goals: [],
  tags: [],
  facts: [],
}

describe('userDataExportSchema', () => {
  it('parses a full export payload', () => {
    const result = userDataExportSchema.parse(validExport)
    expect(result.account.email).toBe('ada@example.com')
    expect(result.habits[0].logs[0].value).toBe(1)
  })

  it('rejects a payload missing required top-level collections', () => {
    const { habits: _habits, ...withoutHabits } = validExport
    const result = userDataExportSchema.safeParse(withoutHabits)
    expect(result.success).toBe(false)
  })
})

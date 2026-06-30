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
    proactiveAstraEnabled: true,
  },
  subscription: {
    plan: 'pro',
    isLifetimePro: false,
    source: 'stripe',
    interval: 'month',
    planExpiresAtUtc: '2026-12-31T00:00:00Z',
    trialEndsAtUtc: null,
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
  notifications: [
    {
      id: '22222222-2222-2222-2222-222222222222',
      title: 'Streak saved',
      body: 'Your streak freeze kept your run alive.',
      url: null,
      isRead: true,
      createdAtUtc: '2026-06-02T09:00:00Z',
    },
  ],
  checklistTemplates: [
    {
      id: '33333333-3333-3333-3333-333333333333',
      name: 'Morning routine',
      items: ['Water', 'Stretch'],
      createdAtUtc: '2026-01-03T00:00:00Z',
    },
  ],
  achievements: [
    {
      achievementId: 'first-habit',
      earnedAtUtc: '2026-01-05T00:00:00Z',
    },
  ],
  streakFreezes: [
    {
      usedOnDate: '2026-05-30',
      createdAtUtc: '2026-05-30T00:00:00Z',
    },
  ],
  referrals: [
    {
      status: 'completed',
      createdAtUtc: '2026-02-01T00:00:00Z',
      completedAtUtc: '2026-02-10T00:00:00Z',
      rewardGrantedAtUtc: '2026-02-11T00:00:00Z',
    },
  ],
  apiKeys: [
    {
      id: '44444444-4444-4444-4444-444444444444',
      name: 'CLI token',
      keyPrefix: 'orb_live_abcd',
      scopes: ['habits:read', 'habits:write'],
      isReadOnly: false,
      createdAtUtc: '2026-03-01T00:00:00Z',
      expiresAtUtc: null,
      lastUsedAtUtc: '2026-06-01T12:00:00Z',
      isRevoked: false,
    },
  ],
  friendships: [
    {
      requesterId: '55555555-5555-5555-5555-555555555555',
      addresseeId: '66666666-6666-6666-6666-666666666666',
      status: 'Accepted',
      createdAtUtc: '2026-04-01T00:00:00Z',
      respondedAtUtc: '2026-04-02T00:00:00Z',
    },
  ],
  cheers: [
    {
      senderId: '66666666-6666-6666-6666-666666666666',
      recipientId: '55555555-5555-5555-5555-555555555555',
      habitId: '11111111-1111-1111-1111-111111111111',
      note: 'Nice streak!',
      createdAtUtc: '2026-04-03T00:00:00Z',
    },
  ],
  blockedUsers: [
    {
      blockerId: '55555555-5555-5555-5555-555555555555',
      blockedId: '77777777-7777-7777-7777-777777777777',
      createdAtUtc: '2026-04-04T00:00:00Z',
    },
  ],
  reports: [
    {
      reportedUserId: '77777777-7777-7777-7777-777777777777',
      reason: 'Spam',
      details: null,
      cheerId: null,
      status: 'Pending',
      createdAtUtc: '2026-04-05T00:00:00Z',
    },
  ],
  friendFeedEvents: [
    {
      type: 'StreakMilestone',
      value: 30,
      achievementId: null,
      createdAtUtc: '2026-04-06T00:00:00Z',
    },
  ],
}

describe('userDataExportSchema', () => {
  it('parses a full export payload', () => {
    const result = userDataExportSchema.parse(validExport)
    expect(result.account.email).toBe('ada@example.com')
    expect(result.habits[0]?.logs[0]?.value).toBe(1)
    expect(result.subscription.plan).toBe('pro')
    expect(result.notifications[0]?.title).toBe('Streak saved')
    expect(result.checklistTemplates[0]?.items).toEqual(['Water', 'Stretch'])
    expect(result.achievements[0]?.achievementId).toBe('first-habit')
    expect(result.streakFreezes[0]?.usedOnDate).toBe('2026-05-30')
    expect(result.referrals[0]?.status).toBe('completed')
    expect(result.apiKeys[0]?.keyPrefix).toBe('orb_live_abcd')
  })

  it('strips unknown fields such as a leaked api-key secret hash', () => {
    const withSecret = {
      ...validExport,
      apiKeys: [{ ...validExport.apiKeys[0], keyHash: 'should-not-appear' }],
    }
    const result = userDataExportSchema.parse(withSecret)
    expect(result.apiKeys[0]).not.toHaveProperty('keyHash')
  })

  it('rejects a payload missing required top-level collections', () => {
    const { habits: _habits, ...withoutHabits } = validExport
    const result = userDataExportSchema.safeParse(withoutHabits)
    expect(result.success).toBe(false)
  })
})

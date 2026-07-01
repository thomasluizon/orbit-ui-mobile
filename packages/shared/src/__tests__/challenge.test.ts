import { describe, it, expect } from 'vitest'
import {
  challengeTypeSchema,
  challengeStatusSchema,
  challengeSchema,
  challengeDetailSchema,
  challengeListItemSchema,
  challengeListSchema,
  createChallengeRequestSchema,
  joinChallengeRequestSchema,
  setChallengeHabitsRequestSchema,
} from '../types/challenge'
import { API } from '../api/endpoints'
import { challengeKeys } from '../query/keys'
import { createMockChallengeDetail, createMockChallengeListItem } from './factories'

describe('challengeTypeSchema', () => {
  it('parses both cooperative types', () => {
    expect(challengeTypeSchema.safeParse('CoopGoal').success).toBe(true)
    expect(challengeTypeSchema.safeParse('StreakTogether').success).toBe(true)
  })

  it('rejects an unknown type', () => {
    expect(challengeTypeSchema.safeParse('coop_goal').success).toBe(false)
  })
})

describe('challengeStatusSchema', () => {
  it('parses the lifecycle states', () => {
    expect(challengeStatusSchema.safeParse('Active').success).toBe(true)
    expect(challengeStatusSchema.safeParse('Completed').success).toBe(true)
  })
})

describe('challengeDetailSchema', () => {
  it('round-trips the factory', () => {
    const detail = createMockChallengeDetail()
    expect(challengeDetailSchema.parse(detail)).toEqual(detail)
  })

  it('parses a completed streak challenge with a null target', () => {
    const detail = createMockChallengeDetail({
      type: 'StreakTogether',
      status: 'Completed',
      targetCount: null,
      currentProgress: 9,
      isComplete: true,
      periodEndUtc: null,
      completedAtUtc: '2026-03-31T00:00:00Z',
    })
    expect(challengeDetailSchema.safeParse(detail).success).toBe(true)
  })

  it('exposes the core challenge fields without participants', () => {
    const { participants: _participants, yourLinkedHabitIds: _ids, ...core } = createMockChallengeDetail()
    expect(challengeSchema.safeParse(core).success).toBe(true)
  })
})

describe('challengeListItemSchema', () => {
  it('round-trips the factory', () => {
    const item = createMockChallengeListItem()
    expect(challengeListItemSchema.parse(item)).toEqual(item)
  })

  it('parses a completed streak item with null target and period end', () => {
    const item = createMockChallengeListItem({
      type: 'StreakTogether',
      status: 'Completed',
      targetCount: null,
      isComplete: true,
      periodEndUtc: null,
      hasLinkedHabits: false,
    })
    expect(challengeListItemSchema.safeParse(item).success).toBe(true)
  })

  it('rejects an item missing the participant count', () => {
    const { participantCount: _omit, ...withoutCount } = createMockChallengeListItem()
    expect(challengeListItemSchema.safeParse(withoutCount).success).toBe(false)
  })
})

describe('challengeListSchema', () => {
  it('parses an array of list items', () => {
    expect(challengeListSchema.safeParse([createMockChallengeListItem()]).success).toBe(true)
    expect(challengeListSchema.safeParse([]).success).toBe(true)
  })

  it('rejects a non-array payload', () => {
    expect(challengeListSchema.safeParse(createMockChallengeListItem()).success).toBe(false)
  })
})

describe('setChallengeHabitsRequestSchema', () => {
  it('accepts a habit id list', () => {
    expect(setChallengeHabitsRequestSchema.safeParse({ habitIds: ['habit-1'] }).success).toBe(true)
  })

  it('rejects an empty habit id list', () => {
    expect(setChallengeHabitsRequestSchema.safeParse({ habitIds: [] }).success).toBe(false)
  })

  it('rejects more than 20 habit ids', () => {
    const tooMany = Array.from({ length: 21 }, (_, index) => `habit-${index}`)
    expect(setChallengeHabitsRequestSchema.safeParse({ habitIds: tooMany }).success).toBe(false)
  })

  it('rejects a request without habitIds', () => {
    expect(setChallengeHabitsRequestSchema.safeParse({}).success).toBe(false)
  })
})

describe('createChallengeRequestSchema', () => {
  it('accepts a goal challenge with invited friends', () => {
    const request = {
      type: 'CoopGoal',
      title: 'March Together',
      targetCount: 30,
      periodStartUtc: '2026-03-01',
      periodEndUtc: '2026-03-31',
      linkedHabitIds: ['habit-1'],
      invitedFriendUserIds: ['user-2'],
    }
    expect(createChallengeRequestSchema.safeParse(request).success).toBe(true)
  })

  it('rejects a request without linked habits', () => {
    const request = { type: 'CoopGoal', title: 'X', periodStartUtc: '2026-03-01' }
    expect(createChallengeRequestSchema.safeParse(request).success).toBe(false)
  })
})

describe('joinChallengeRequestSchema', () => {
  it('requires a code and linked habits', () => {
    expect(joinChallengeRequestSchema.safeParse({ code: 'ABC23456', linkedHabitIds: ['habit-1'] }).success).toBe(true)
    expect(joinChallengeRequestSchema.safeParse({ code: 'ABC23456' }).success).toBe(false)
  })
})

describe('challenge endpoints and keys', () => {
  it('builds the challenge routes', () => {
    expect(API.challenges.list).toBe('/api/challenges')
    expect(API.challenges.create).toBe('/api/challenges')
    expect(API.challenges.join).toBe('/api/challenges/join')
    expect(API.challenges.leave('c1')).toBe('/api/challenges/c1/leave')
    expect(API.challenges.detail('c1')).toBe('/api/challenges/c1')
    expect(API.challenges.setHabits('c1')).toBe('/api/challenges/c1/habits')
  })

  it('builds hierarchical query keys', () => {
    expect(challengeKeys.all).toEqual(['challenges'])
    expect(challengeKeys.list()).toEqual(['challenges', 'list'])
    expect(challengeKeys.detail('c1')).toEqual(['challenges', 'detail', 'c1'])
  })
})

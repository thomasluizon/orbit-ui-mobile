import { describe, it, expect } from 'vitest'
import {
  accountabilityCadenceSchema,
  accountabilityPairStatusSchema,
  accountabilityPairSchema,
  accountabilityPairsResponseSchema,
  accountabilityCheckInSchema,
  accountabilityCheckInsPageSchema,
  inviteAccountabilityBuddyRequestSchema,
  acceptAccountabilityPairRequestSchema,
  setAccountabilityHabitsRequestSchema,
  checkInAccountabilityRequestSchema,
} from '../types/accountability'
import { API } from '../api/endpoints'
import { accountabilityKeys } from '../query/keys'


const validPair = {
  id: 'pair-1',
  buddy: {
    userId: 'user-2',
    handle: 'grace_h',
    displayName: 'Grace Hopper',
  },
  cadence: 'Daily',
  status: 'Accepted',
  isInitiatedByMe: true,
  myHabitIds: ['habit-1', 'habit-2'],
  buddyHabitIds: ['habit-9'],
  myLastCheckInDate: '2026-06-29',
  buddyLastCheckInDate: '2026-06-28',
  createdAtUtc: '2026-06-01T00:00:00Z',
}

const validCheckIn = {
  id: 'check-in-1',
  userId: 'user-1',
  handle: 'ada_l',
  displayName: 'Ada Lovelace',
  date: '2026-06-29',
  note: 'Logged everything today',
  createdAtUtc: '2026-06-29T12:00:00Z',
}


describe('accountabilityCadenceSchema', () => {
  it('parses each whitelisted cadence', () => {
    expect(accountabilityCadenceSchema.safeParse('Daily').success).toBe(true)
    expect(accountabilityCadenceSchema.safeParse('Weekly').success).toBe(true)
  })

  it('rejects an unknown cadence', () => {
    expect(accountabilityCadenceSchema.safeParse('Monthly').success).toBe(false)
  })
})


describe('accountabilityPairStatusSchema', () => {
  it('parses each whitelisted status', () => {
    for (const status of ['Pending', 'Accepted', 'Ended']) {
      expect(accountabilityPairStatusSchema.safeParse(status).success).toBe(true)
    }
  })

  it('rejects an unknown status', () => {
    expect(accountabilityPairStatusSchema.safeParse('Cancelled').success).toBe(false)
  })
})


describe('accountabilityPairSchema', () => {
  it('parses a full valid pair', () => {
    expect(accountabilityPairSchema.safeParse(validPair).success).toBe(true)
  })

  it('accepts null last check-in dates', () => {
    const result = accountabilityPairSchema.safeParse({
      ...validPair,
      myLastCheckInDate: null,
      buddyLastCheckInDate: null,
    })
    expect(result.success).toBe(true)
  })

  it('rejects a pair missing the buddy', () => {
    const { buddy: _omit, ...withoutBuddy } = validPair
    expect(accountabilityPairSchema.safeParse(withoutBuddy).success).toBe(false)
  })
})


describe('accountabilityPairsResponseSchema', () => {
  it('parses active pairs with incoming and outgoing invites', () => {
    const result = accountabilityPairsResponseSchema.safeParse({
      activePairs: [validPair],
      incomingInvites: [],
      outgoingInvites: [{ ...validPair, id: 'pair-2', status: 'Pending' }],
    })
    expect(result.success).toBe(true)
  })

  it('rejects when a collection is not an array', () => {
    const result = accountabilityPairsResponseSchema.safeParse({
      activePairs: null,
      incomingInvites: [],
      outgoingInvites: [],
    })
    expect(result.success).toBe(false)
  })
})


describe('accountabilityCheckInSchema', () => {
  it('parses a valid check-in', () => {
    expect(accountabilityCheckInSchema.safeParse(validCheckIn).success).toBe(true)
  })

  it('accepts a null note', () => {
    expect(accountabilityCheckInSchema.safeParse({ ...validCheckIn, note: null }).success).toBe(true)
  })
})


describe('accountabilityCheckInsPageSchema', () => {
  it('parses a check-ins page', () => {
    expect(accountabilityCheckInsPageSchema.safeParse({ items: [validCheckIn] }).success).toBe(true)
  })
})


describe('inviteAccountabilityBuddyRequestSchema', () => {
  it('parses a valid invite request', () => {
    const result = inviteAccountabilityBuddyRequestSchema.safeParse({
      buddyUserId: 'user-2',
      cadence: 'Daily',
      habitIds: ['habit-1'],
    })
    expect(result.success).toBe(true)
  })

  it('rejects empty habit ids', () => {
    const result = inviteAccountabilityBuddyRequestSchema.safeParse({
      buddyUserId: 'user-2',
      cadence: 'Daily',
      habitIds: [],
    })
    expect(result.success).toBe(false)
  })

  it('rejects more than ten habit ids', () => {
    const result = inviteAccountabilityBuddyRequestSchema.safeParse({
      buddyUserId: 'user-2',
      cadence: 'Daily',
      habitIds: Array.from({ length: 11 }, () => 'habit-1'),
    })
    expect(result.success).toBe(false)
  })

  it('rejects an invalid cadence', () => {
    const result = inviteAccountabilityBuddyRequestSchema.safeParse({
      buddyUserId: 'user-2',
      cadence: 'Monthly',
      habitIds: ['habit-1'],
    })
    expect(result.success).toBe(false)
  })
})


describe('acceptAccountabilityPairRequestSchema', () => {
  it('parses a valid accept request', () => {
    expect(acceptAccountabilityPairRequestSchema.safeParse({ habitIds: ['h-1'] }).success).toBe(true)
  })

  it('rejects empty habit ids', () => {
    expect(acceptAccountabilityPairRequestSchema.safeParse({ habitIds: [] }).success).toBe(false)
  })
})


describe('setAccountabilityHabitsRequestSchema', () => {
  it('parses a valid set-habits request', () => {
    expect(setAccountabilityHabitsRequestSchema.safeParse({ habitIds: ['h-1'] }).success).toBe(true)
  })

  it('rejects empty habit ids', () => {
    expect(setAccountabilityHabitsRequestSchema.safeParse({ habitIds: [] }).success).toBe(false)
  })
})


describe('checkInAccountabilityRequestSchema', () => {
  it('parses a request with a note', () => {
    expect(checkInAccountabilityRequestSchema.safeParse({ note: 'nice' }).success).toBe(true)
  })

  it('parses a request without a note', () => {
    expect(checkInAccountabilityRequestSchema.safeParse({}).success).toBe(true)
  })

  it('rejects a note longer than 200 characters', () => {
    expect(checkInAccountabilityRequestSchema.safeParse({ note: 'a'.repeat(201) }).success).toBe(false)
  })
})


describe('accountability API endpoints', () => {
  it('has the correct pairs path', () => {
    expect(API.accountability.pairs).toBe('/api/accountability/pairs')
  })

  it('has correct parameterized paths', () => {
    expect(API.accountability.accept('p-1')).toBe('/api/accountability/pairs/p-1/accept')
    expect(API.accountability.end('p-1')).toBe('/api/accountability/pairs/p-1')
    expect(API.accountability.habits('p-1')).toBe('/api/accountability/pairs/p-1/habits')
    expect(API.accountability.checkIns('p-1')).toBe('/api/accountability/pairs/p-1/check-ins')
  })
})


describe('accountabilityKeys', () => {
  it('all returns base key', () => {
    expect(accountabilityKeys.all).toEqual(['accountability'])
  })

  it('pairs returns pairs key', () => {
    expect(accountabilityKeys.pairs()).toEqual(['accountability', 'pairs'])
  })

  it('checkIns appends the pair id', () => {
    expect(accountabilityKeys.checkIns('p-1')).toEqual(['accountability', 'check-ins', 'p-1'])
  })
})

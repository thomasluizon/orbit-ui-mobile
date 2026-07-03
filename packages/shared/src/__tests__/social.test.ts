import { describe, it, expect } from 'vitest'
import {
  reportReasonSchema,
  friendFeedEventTypeSchema,
  handleSchema,
  setHandleRequestSchema,
  socialOptInRequestSchema,
  friendSummarySchema,
  friendRequestSummarySchema,
  friendsResponseSchema,
  friendFeedItemSchema,
  friendFeedPageSchema,
  cheerSchema,
  sendCheerRequestSchema,
  cheersPageSchema,
  sendFriendRequestSchema,
  friendInvitePreviewSchema,
  blockUserRequestSchema,
  reportUserRequestSchema,
  friendProfileViewSchema,
} from '../types/social'
import { userDataExportSchema } from '../types/data-export'
import { API } from '../api/endpoints'
import { friendKeys, cheerKeys } from '../query/keys'
import {
  createMockFriendSummary,
  createMockCheer,
  createMockFriendFeedItem,
} from './factories'


describe('reportReasonSchema', () => {
  it('parses each whitelisted reason', () => {
    for (const reason of ['Spam', 'Harassment', 'InappropriateContent', 'Impersonation', 'Other']) {
      expect(reportReasonSchema.safeParse(reason).success).toBe(true)
    }
  })

  it('rejects an unknown reason', () => {
    expect(reportReasonSchema.safeParse('Toxic').success).toBe(false)
  })
})


describe('friendFeedEventTypeSchema', () => {
  it('parses each whitelisted event type', () => {
    for (const type of ['StreakMilestone', 'AchievementUnlocked', 'HabitCompletedMilestone']) {
      expect(friendFeedEventTypeSchema.safeParse(type).success).toBe(true)
    }
  })

  it('rejects an unknown event type', () => {
    expect(friendFeedEventTypeSchema.safeParse('FriendJoined').success).toBe(false)
  })
})


describe('handleSchema', () => {
  it('accepts a valid handle', () => {
    expect(handleSchema.safeParse('user_abc12').success).toBe(true)
  })

  it('rejects a too-short handle', () => {
    expect(handleSchema.safeParse('ab').success).toBe(false)
  })

  it('rejects a handle with a space', () => {
    expect(handleSchema.safeParse('has space').success).toBe(false)
  })

  it('rejects a too-long handle', () => {
    expect(handleSchema.safeParse('a'.repeat(21)).success).toBe(false)
  })
})


describe('setHandleRequestSchema', () => {
  it('parses a valid set-handle request', () => {
    expect(setHandleRequestSchema.safeParse({ handle: 'grace_h' }).success).toBe(true)
  })

  it('rejects an invalid handle', () => {
    expect(setHandleRequestSchema.safeParse({ handle: 'no' }).success).toBe(false)
  })
})


describe('socialOptInRequestSchema', () => {
  it('parses a valid opt-in request', () => {
    expect(socialOptInRequestSchema.safeParse({ enabled: true }).success).toBe(true)
  })

  it('rejects a non-boolean enabled', () => {
    expect(socialOptInRequestSchema.safeParse({ enabled: 'yes' }).success).toBe(false)
  })
})


describe('friendSummarySchema', () => {
  it('parses a valid friend summary', () => {
    expect(friendSummarySchema.safeParse(createMockFriendSummary()).success).toBe(true)
  })

  it('rejects a summary missing currentStreak', () => {
    const { currentStreak: _omit, ...withoutStreak } = createMockFriendSummary()
    expect(friendSummarySchema.safeParse(withoutStreak).success).toBe(false)
  })
})


describe('friendRequestSummarySchema', () => {
  it('parses a valid friend request summary', () => {
    const result = friendRequestSummarySchema.safeParse({
      id: 'friendship-1',
      userId: 'user-9',
      handle: 'turing_a',
      displayName: 'Alan Turing',
      createdAtUtc: '2026-01-01T00:00:00Z',
    })
    expect(result.success).toBe(true)
  })

  it('rejects a request summary missing the friendship id', () => {
    const result = friendRequestSummarySchema.safeParse({
      userId: 'user-9',
      handle: 'turing_a',
      displayName: 'Alan Turing',
      createdAtUtc: '2026-01-01T00:00:00Z',
    })
    expect(result.success).toBe(false)
  })
})


describe('friendsResponseSchema', () => {
  it('parses friends with incoming and outgoing requests', () => {
    const result = friendsResponseSchema.safeParse({
      friends: [createMockFriendSummary()],
      incomingRequests: [
        {
          id: 'friendship-2',
          userId: 'user-3',
          handle: 'hopper_g',
          displayName: 'Grace Hopper',
          createdAtUtc: '2026-01-02T00:00:00Z',
        },
      ],
      outgoingRequests: [],
    })
    expect(result.success).toBe(true)
  })

  it('rejects when a request collection is not an array', () => {
    const result = friendsResponseSchema.safeParse({
      friends: [],
      incomingRequests: null,
      outgoingRequests: [],
    })
    expect(result.success).toBe(false)
  })
})


describe('friendFeedItemSchema', () => {
  it('round-trips a milestone item with a numeric value and null achievementId', () => {
    const item = createMockFriendFeedItem({ value: 30, achievementId: null })
    const parsed = friendFeedItemSchema.parse(item)
    expect(parsed.value).toBe(30)
    expect(parsed.achievementId).toBeNull()
  })

  it('round-trips an achievement item with a null value and a non-null achievementId', () => {
    const item = createMockFriendFeedItem({
      type: 'AchievementUnlocked',
      value: null,
      achievementId: 'first-habit',
    })
    const parsed = friendFeedItemSchema.parse(item)
    expect(parsed.value).toBeNull()
    expect(parsed.achievementId).toBe('first-habit')
  })

  it('rejects an unknown feed event type', () => {
    const result = friendFeedItemSchema.safeParse({
      ...createMockFriendFeedItem(),
      type: 'FriendJoined',
    })
    expect(result.success).toBe(false)
  })
})


describe('friendFeedPageSchema', () => {
  it('parses a page with a next cursor', () => {
    const result = friendFeedPageSchema.safeParse({
      items: [createMockFriendFeedItem()],
      nextCursor: 'cursor-abc',
    })
    expect(result.success).toBe(true)
  })

  it('parses a terminal page with a null cursor', () => {
    const result = friendFeedPageSchema.safeParse({ items: [], nextCursor: null })
    expect(result.success).toBe(true)
  })

  it('rejects a page missing items', () => {
    expect(friendFeedPageSchema.safeParse({ nextCursor: null }).success).toBe(false)
  })
})


describe('cheerSchema', () => {
  it('parses a valid cheer with sender display fields', () => {
    expect(cheerSchema.safeParse(createMockCheer()).success).toBe(true)
  })

  it('accepts a null note', () => {
    expect(cheerSchema.safeParse(createMockCheer({ note: null })).success).toBe(true)
  })

  it('rejects a cheer missing the sender handle', () => {
    const { senderHandle: _omit, ...withoutHandle } = createMockCheer()
    expect(cheerSchema.safeParse(withoutHandle).success).toBe(false)
  })
})


describe('sendCheerRequestSchema', () => {
  it('parses a cheer request with a note', () => {
    const result = sendCheerRequestSchema.safeParse({
      recipientId: 'user-1',
      habitId: 'habit-1',
      note: 'Proud of you!',
    })
    expect(result.success).toBe(true)
  })

  it('parses a cheer request without a note', () => {
    const result = sendCheerRequestSchema.safeParse({
      recipientId: 'user-1',
      habitId: 'habit-1',
    })
    expect(result.success).toBe(true)
  })

  it('rejects a note longer than 200 characters', () => {
    const result = sendCheerRequestSchema.safeParse({
      recipientId: 'user-1',
      habitId: 'habit-1',
      note: 'a'.repeat(201),
    })
    expect(result.success).toBe(false)
  })

  it('rejects a request missing the recipient', () => {
    expect(sendCheerRequestSchema.safeParse({ habitId: 'habit-1' }).success).toBe(false)
  })
})


describe('cheersPageSchema', () => {
  it('parses a cheers page', () => {
    const result = cheersPageSchema.safeParse({ items: [createMockCheer()] })
    expect(result.success).toBe(true)
  })

  it('rejects a page whose items are not an array', () => {
    expect(cheersPageSchema.safeParse({ items: createMockCheer() }).success).toBe(false)
  })
})


describe('sendFriendRequestSchema', () => {
  it('parses a request by handle', () => {
    expect(sendFriendRequestSchema.safeParse({ handle: 'grace_h' }).success).toBe(true)
  })

  it('parses a request by referral code', () => {
    expect(sendFriendRequestSchema.safeParse({ referralCode: 'REF123' }).success).toBe(true)
  })

  it('parses an empty request (server enforces exactly-one)', () => {
    expect(sendFriendRequestSchema.safeParse({}).success).toBe(true)
  })

  it('rejects a non-string handle', () => {
    expect(sendFriendRequestSchema.safeParse({ handle: 42 }).success).toBe(false)
  })
})


describe('friendInvitePreviewSchema', () => {
  const base = {
    handle: 'grace_h',
    displayName: 'Grace Hopper',
    isSelf: false,
    isAlreadyFriend: false,
    hasPendingRequest: false,
  }

  it('parses a full preview payload', () => {
    expect(friendInvitePreviewSchema.safeParse(base).success).toBe(true)
  })

  it('rejects a payload missing a relationship flag', () => {
    const { hasPendingRequest: _omitted, ...withoutFlag } = base
    expect(friendInvitePreviewSchema.safeParse(withoutFlag).success).toBe(false)
  })

  it('rejects a non-boolean isSelf', () => {
    expect(friendInvitePreviewSchema.safeParse({ ...base, isSelf: 'yes' }).success).toBe(false)
  })
})


describe('blockUserRequestSchema', () => {
  it('parses a valid block request', () => {
    expect(blockUserRequestSchema.safeParse({ blockedUserId: 'user-7' }).success).toBe(true)
  })

  it('rejects a request missing the blocked user id', () => {
    expect(blockUserRequestSchema.safeParse({}).success).toBe(false)
  })
})


describe('reportUserRequestSchema', () => {
  it('parses a full report with details and a cheer reference', () => {
    const result = reportUserRequestSchema.safeParse({
      reportedUserId: 'user-7',
      reason: 'Harassment',
      details: 'Repeated unwanted cheers.',
      cheerId: 'cheer-1',
    })
    expect(result.success).toBe(true)
  })

  it('parses a minimal report with only a reason', () => {
    const result = reportUserRequestSchema.safeParse({
      reportedUserId: 'user-7',
      reason: 'Spam',
    })
    expect(result.success).toBe(true)
  })

  it('rejects an unknown reason', () => {
    const result = reportUserRequestSchema.safeParse({
      reportedUserId: 'user-7',
      reason: 'Toxic',
    })
    expect(result.success).toBe(false)
  })

  it('rejects details longer than 500 characters', () => {
    const result = reportUserRequestSchema.safeParse({
      reportedUserId: 'user-7',
      reason: 'Other',
      details: 'a'.repeat(501),
    })
    expect(result.success).toBe(false)
  })
})


describe('friendProfileViewSchema', () => {
  const validProfile = {
    userId: 'user-1',
    handle: 'grace_h',
    displayName: 'Grace Hopper',
    currentStreak: 12,
    longestStreak: 40,
    level: 4,
    levelTitle: 'Navigator',
    totalXp: 820,
    friendsSinceUtc: '2026-05-01T00:00:00Z',
    weeklyActivity: [0, 1, 2, 0, 3, 1, 2],
    achievements: [{ name: 'First Habit', iconKey: 'first-habit', rarity: 'Common' }],
    topHabits: [{ title: 'Reading', emoji: '📖', completionCount: 40 }],
    isAccountabilityPartner: true,
    sharedChallenges: [{ id: 'challenge-1', title: 'Sunrise Sprint' }],
  }

  it('parses a valid friend profile view', () => {
    expect(friendProfileViewSchema.safeParse(validProfile).success).toBe(true)
  })

  it('accepts an empty achievements array', () => {
    expect(friendProfileViewSchema.safeParse({ ...validProfile, achievements: [] }).success).toBe(true)
  })

  it('accepts a null friendsSinceUtc', () => {
    expect(friendProfileViewSchema.safeParse({ ...validProfile, friendsSinceUtc: null }).success).toBe(true)
  })

  it('accepts a null top-habit emoji', () => {
    const topHabits = [{ title: 'Meditate', emoji: null, completionCount: 3 }]
    expect(friendProfileViewSchema.safeParse({ ...validProfile, topHabits }).success).toBe(true)
  })

  it('rejects a weekly activity array that is not seven days', () => {
    expect(friendProfileViewSchema.safeParse({ ...validProfile, weeklyActivity: [1, 2, 3] }).success).toBe(false)
  })

  it('rejects a non-string userId', () => {
    expect(friendProfileViewSchema.safeParse({ ...validProfile, userId: 42 }).success).toBe(false)
  })

  it('rejects a null handle (the contract sends an empty string, never null)', () => {
    expect(friendProfileViewSchema.safeParse({ ...validProfile, handle: null }).success).toBe(false)
  })

  it('rejects a profile missing the level', () => {
    const { level: _omit, ...withoutLevel } = validProfile
    expect(friendProfileViewSchema.safeParse(withoutLevel).success).toBe(false)
  })
})


describe('userDataExportSchema social collections', () => {
  const exportWithSocial = {
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
      proactiveAstraEnabled: false,
    },
    subscription: {
      plan: 'pro',
      isLifetimePro: false,
      source: 'stripe',
      interval: 'month',
      planExpiresAtUtc: null,
      trialEndsAtUtc: null,
    },
    habits: [],
    goals: [],
    tags: [],
    facts: [],
    notifications: [],
    checklistTemplates: [],
    achievements: [],
    streakFreezes: [],
    referrals: [],
    apiKeys: [],
    friendships: [
      {
        requesterId: 'user-1',
        addresseeId: 'user-2',
        status: 'Accepted',
        createdAtUtc: '2026-04-01T00:00:00Z',
        respondedAtUtc: '2026-04-02T00:00:00Z',
      },
    ],
    cheers: [
      {
        senderId: 'user-2',
        recipientId: 'user-1',
        habitId: 'habit-1',
        note: 'Nice streak!',
        createdAtUtc: '2026-04-03T00:00:00Z',
      },
    ],
    blockedUsers: [
      {
        blockerId: 'user-1',
        blockedId: 'user-3',
        createdAtUtc: '2026-04-04T00:00:00Z',
      },
    ],
    reports: [
      {
        reportedUserId: 'user-3',
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

  it('parses an export payload that includes the social collections', () => {
    const result = userDataExportSchema.parse(exportWithSocial)
    expect(result.friendships[0]?.status).toBe('Accepted')
    expect(result.cheers[0]?.note).toBe('Nice streak!')
    expect(result.blockedUsers[0]?.blockedId).toBe('user-3')
    expect(result.reports[0]?.reason).toBe('Spam')
    expect(result.friendFeedEvents[0]?.value).toBe(30)
  })

  it('rejects an export payload missing the new social collections', () => {
    const { friendships: _omit, ...withoutFriendships } = exportWithSocial
    expect(userDataExportSchema.safeParse(withoutFriendships).success).toBe(false)
  })
})


describe('friends API endpoints', () => {
  it('has correct static paths', () => {
    expect(API.profile.handle).toBe('/api/profile/handle')
    expect(API.profile.socialOptIn).toBe('/api/profile/social-opt-in')
    expect(API.friends.list).toBe('/api/friends')
    expect(API.friends.requests).toBe('/api/friends/requests')
    expect(API.friends.feed).toBe('/api/friends/feed')
    expect(API.friends.cheers).toBe('/api/friends/cheers')
    expect(API.friends.block).toBe('/api/friends/block')
    expect(API.friends.report).toBe('/api/friends/report')
  })

  it('has correct parameterized paths', () => {
    expect(API.friends.acceptRequest('fr-1')).toBe('/api/friends/requests/fr-1/accept')
    expect(API.friends.remove('user-1')).toBe('/api/friends/user-1')
    expect(API.friends.unblock('user-2')).toBe('/api/friends/block/user-2')
    expect(API.friends.profile('user-1')).toBe('/api/friends/user-1/profile')
  })

  it('encodes the invite-preview code into the query string', () => {
    expect(API.friends.invitePreview('REF123')).toBe('/api/friends/invite-preview?code=REF123')
    expect(API.friends.invitePreview('a b&c')).toBe('/api/friends/invite-preview?code=a%20b%26c')
  })
})


describe('friendKeys', () => {
  it('all returns base key', () => {
    expect(friendKeys.all).toEqual(['friends'])
  })

  it('list returns list key', () => {
    expect(friendKeys.list()).toEqual(['friends', 'list'])
  })

  it('feed returns feed key', () => {
    expect(friendKeys.feed()).toEqual(['friends', 'feed'])
  })

  it('profile appends the userId', () => {
    expect(friendKeys.profile('user-1')).toEqual(['friends', 'profile', 'user-1'])
  })

  it('invitePreview appends the code', () => {
    expect(friendKeys.invitePreview('REF123')).toEqual(['friends', 'invitePreview', 'REF123'])
  })
})


describe('cheerKeys', () => {
  it('all returns base key', () => {
    expect(cheerKeys.all).toEqual(['cheers'])
  })

  it('list appends direction', () => {
    expect(cheerKeys.list('received')).toEqual(['cheers', 'list', 'received'])
    expect(cheerKeys.list('sent')).toEqual(['cheers', 'list', 'sent'])
  })

  it('list produces distinct keys per direction', () => {
    expect(cheerKeys.list('received')).not.toEqual(cheerKeys.list('sent'))
  })
})

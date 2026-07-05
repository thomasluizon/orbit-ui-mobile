import { describe, expect, it } from 'vitest'
import {
  MARKETING_CONSENT_MILESTONE_KEY,
  REFERRAL_PROMPT_COOLDOWN_DAYS,
  canPromptEngagement,
  createEngagementPromptStoreState,
  getMilestoneShareAchievementKey,
  getMilestoneShareStreakKey,
  getPersistedEngagementPromptState,
  getReferralLevelMilestone,
  getReviewMomentLevelKey,
  getReviewMomentStreakKey,
  migratePersistedEngagementPromptState,
  parseMilestoneShareKey,
  parseReferralMilestoneKey,
  parseReviewMomentKey,
  type EngagementPromptStoreState,
} from '../stores/engagement-prompt-store'

function createStoreHarness() {
  let state = {} as EngagementPromptStoreState

  const set = (
    partial:
      | Partial<EngagementPromptStoreState>
      | ((current: EngagementPromptStoreState) => Partial<EngagementPromptStoreState>),
  ) => {
    const next = typeof partial === 'function' ? partial(state) : partial
    state = { ...state, ...next }
  }

  state = createEngagementPromptStoreState(set)

  return {
    getState: () => state,
  }
}

const DAY_MS = 24 * 60 * 60 * 1000

describe('getMilestoneShareStreakKey', () => {
  it('returns milestone-share keys for 7, 30, and 100', () => {
    expect(getMilestoneShareStreakKey(7)).toBe('share-streak-7')
    expect(getMilestoneShareStreakKey(30)).toBe('share-streak-30')
    expect(getMilestoneShareStreakKey(100)).toBe('share-streak-100')
  })

  it('returns null for non-milestone streaks', () => {
    for (const streak of [0, 6, 8, 14, 29, 99, 101, 365]) {
      expect(getMilestoneShareStreakKey(streak)).toBeNull()
    }
  })
})

describe('milestone-share keys', () => {
  it('builds an achievement key namespaced apart from streak keys', () => {
    expect(getMilestoneShareAchievementKey('centurion')).toBe('share-achv-centurion')
  })

  it('parses streak and achievement keys back into kind and payload', () => {
    expect(parseMilestoneShareKey('share-streak-30')).toEqual({
      kind: 'streak',
      value: 30,
    })
    expect(parseMilestoneShareKey('share-achv-centurion')).toEqual({
      kind: 'achievement',
      achievementId: 'centurion',
    })
  })

  it('parses achievement ids that themselves contain hyphens', () => {
    expect(parseMilestoneShareKey('share-achv-week-warrior')).toEqual({
      kind: 'achievement',
      achievementId: 'week-warrior',
    })
  })

  it('returns null for malformed milestone-share keys', () => {
    expect(parseMilestoneShareKey('share-streak-')).toBeNull()
    expect(parseMilestoneShareKey('share-achv-')).toBeNull()
    expect(parseMilestoneShareKey('streak-7')).toBeNull()
    expect(parseMilestoneShareKey('share-streak-abc')).toBeNull()
  })
})

describe('referral milestone keys', () => {
  it('builds a level milestone key', () => {
    expect(getReferralLevelMilestone(5)).toBe('level-5')
  })

  it('parses streak and level keys back into kind and value', () => {
    expect(parseReferralMilestoneKey('streak-30')).toEqual({
      kind: 'streak',
      value: 30,
    })
    expect(parseReferralMilestoneKey('level-12')).toEqual({
      kind: 'level',
      value: 12,
    })
  })

  it('returns null for malformed milestone keys', () => {
    expect(parseReferralMilestoneKey('streak')).toBeNull()
    expect(parseReferralMilestoneKey('badge-3')).toBeNull()
    expect(parseReferralMilestoneKey('streak-abc')).toBeNull()
  })
})

describe('review-moment keys', () => {
  it('returns review keys for the 7/14/30/100/365 milestones', () => {
    expect(getReviewMomentStreakKey(7)).toBe('review-streak-7')
    expect(getReviewMomentStreakKey(14)).toBe('review-streak-14')
    expect(getReviewMomentStreakKey(30)).toBe('review-streak-30')
    expect(getReviewMomentStreakKey(100)).toBe('review-streak-100')
    expect(getReviewMomentStreakKey(365)).toBe('review-streak-365')
  })

  it('returns null for non-milestone streaks', () => {
    for (const streak of [0, 1, 6, 8, 15, 29, 99, 101, 364, 366]) {
      expect(getReviewMomentStreakKey(streak)).toBeNull()
    }
  })

  it('builds a level key namespaced apart from referral and share keys', () => {
    expect(getReviewMomentLevelKey(5)).toBe('review-level-5')
  })

  it('parses streak and level keys back into kind and value', () => {
    expect(parseReviewMomentKey('review-streak-14')).toEqual({
      kind: 'streak',
      value: 14,
    })
    expect(parseReviewMomentKey('review-level-8')).toEqual({
      kind: 'level',
      value: 8,
    })
  })

  it('returns null for malformed review-moment keys', () => {
    expect(parseReviewMomentKey('review-streak-')).toBeNull()
    expect(parseReviewMomentKey('review-level-abc')).toBeNull()
    expect(parseReviewMomentKey('share-streak-7')).toBeNull()
    expect(parseReviewMomentKey('level-5')).toBeNull()
  })
})

describe('canPromptEngagement', () => {
  const now = '2026-06-27T12:00:00.000Z'

  it('allows a fresh milestone with no prior prompt', () => {
    expect(
      canPromptEngagement(
        { promptedMilestoneKeys: [], lastPromptedAtIso: null },
        'share-streak-7',
        now,
      ),
    ).toBe(true)
  })

  it('blocks a milestone that was already prompted', () => {
    expect(
      canPromptEngagement(
        { promptedMilestoneKeys: ['share-streak-7'], lastPromptedAtIso: null },
        'share-streak-7',
        now,
      ),
    ).toBe(false)
  })

  it('blocks a new milestone while within the cooldown window', () => {
    const lastPromptedAtIso = new Date(
      new Date(now).getTime() - (REFERRAL_PROMPT_COOLDOWN_DAYS - 1) * DAY_MS,
    ).toISOString()

    expect(
      canPromptEngagement(
        { promptedMilestoneKeys: ['share-streak-7'], lastPromptedAtIso },
        'level-3',
        now,
      ),
    ).toBe(false)
  })

  it('allows a new milestone once the cooldown has elapsed', () => {
    const lastPromptedAtIso = new Date(
      new Date(now).getTime() - (REFERRAL_PROMPT_COOLDOWN_DAYS + 1) * DAY_MS,
    ).toISOString()

    expect(
      canPromptEngagement(
        { promptedMilestoneKeys: ['share-streak-7'], lastPromptedAtIso },
        'level-3',
        now,
      ),
    ).toBe(true)
  })
})

describe('shared cooldown across kinds', () => {
  const now = '2026-06-27T12:00:00.000Z'

  it('blocks a referral prompt within the cooldown after a milestone-share prompt', () => {
    const store = createStoreHarness()

    store.getState().markEngagementPrompted('share-streak-7', now)

    expect(canPromptEngagement(store.getState(), 'level-3', now)).toBe(false)
  })

  it('records prompts of any kind into the one shared prompted-keys budget', () => {
    const store = createStoreHarness()

    store.getState().markEngagementPrompted('share-streak-7', '2026-06-01T00:00:00.000Z')
    store.getState().markEngagementPrompted('level-3', '2026-06-20T00:00:00.000Z')

    expect(store.getState().promptedMilestoneKeys).toEqual([
      'share-streak-7',
      'level-3',
    ])
  })
})

describe('engagement prompt store factory', () => {
  it('arms and clears a referral prompt', () => {
    const store = createStoreHarness()

    store.getState().armReferralPrompt('level-5')
    expect(store.getState().armedPrompt).toEqual({
      kind: 'referral',
      milestoneKey: 'level-5',
    })

    store.getState().clearArmedMilestone()
    expect(store.getState().armedPrompt).toBeNull()
  })

  it('arms a milestone-share prompt', () => {
    const store = createStoreHarness()

    store.getState().armMilestoneSharePrompt('share-streak-30')
    expect(store.getState().armedPrompt).toEqual({
      kind: 'milestone-share',
      milestoneKey: 'share-streak-30',
    })
  })

  it('records a prompted milestone, sets the timestamp, and clears the armed prompt', () => {
    const store = createStoreHarness()

    store.getState().armMilestoneSharePrompt('share-streak-7')
    store.getState().markEngagementPrompted('share-streak-7', '2026-06-27T12:00:00.000Z')

    expect(store.getState().promptedMilestoneKeys).toEqual(['share-streak-7'])
    expect(store.getState().lastPromptedAtIso).toBe('2026-06-27T12:00:00.000Z')
    expect(store.getState().armedPrompt).toBeNull()
  })

  it('does not duplicate an already-recorded milestone key', () => {
    const store = createStoreHarness()

    store.getState().markEngagementPrompted('share-streak-7', '2026-06-01T00:00:00.000Z')
    store.getState().markEngagementPrompted('share-streak-7', '2026-06-27T12:00:00.000Z')

    expect(store.getState().promptedMilestoneKeys).toEqual(['share-streak-7'])
    expect(store.getState().lastPromptedAtIso).toBe('2026-06-27T12:00:00.000Z')
  })

  it('flips the home-entry dismissed flag', () => {
    const store = createStoreHarness()

    expect(store.getState().homeEntryDismissed).toBe(false)
    store.getState().dismissHomeEntry()
    expect(store.getState().homeEntryDismissed).toBe(true)
  })

  it('omits the armed prompt from the persisted snapshot', () => {
    const store = createStoreHarness()

    store.getState().armMilestoneSharePrompt('share-streak-100')
    store.getState().dismissHomeEntry()
    store.getState().dismissSocialEntry()

    const snapshot = getPersistedEngagementPromptState(store.getState())

    expect(snapshot).not.toHaveProperty('armedPrompt')
    expect(snapshot).toEqual({
      promptedMilestoneKeys: [],
      lastPromptedAtIso: null,
      homeEntryDismissed: true,
      socialEntryDismissed: true,
    })
  })
})

describe('engagement prompt arbiter', () => {
  it('lets a milestone-share prompt outrank a referral prompt armed first', () => {
    const store = createStoreHarness()

    store.getState().armReferralPrompt('level-3')
    store.getState().armMilestoneSharePrompt('share-streak-7')

    expect(store.getState().armedPrompt).toEqual({
      kind: 'milestone-share',
      milestoneKey: 'share-streak-7',
    })
  })

  it('keeps an armed milestone-share prompt when a lower-priority referral prompt arms after', () => {
    const store = createStoreHarness()

    store.getState().armMilestoneSharePrompt('share-streak-7')
    store.getState().armReferralPrompt('level-3')

    expect(store.getState().armedPrompt).toEqual({
      kind: 'milestone-share',
      milestoneKey: 'share-streak-7',
    })
  })

  it('replaces an armed milestone-share prompt with the latest one (equal priority, last wins)', () => {
    const store = createStoreHarness()

    store.getState().armMilestoneSharePrompt('share-streak-7')
    store.getState().armMilestoneSharePrompt('share-achv-centurion')

    expect(store.getState().armedPrompt).toEqual({
      kind: 'milestone-share',
      milestoneKey: 'share-achv-centurion',
    })
  })

  it('lets a review prompt outrank an armed milestone-share prompt', () => {
    const store = createStoreHarness()

    store.getState().armMilestoneSharePrompt('share-streak-7')
    store.getState().armReviewPrompt('review-streak-7')

    expect(store.getState().armedPrompt).toEqual({
      kind: 'review',
      milestoneKey: 'review-streak-7',
    })
  })

  it('keeps an armed review prompt when share and referral prompts arm after', () => {
    const store = createStoreHarness()

    store.getState().armReviewPrompt('review-level-5')
    store.getState().armMilestoneSharePrompt('share-streak-7')
    store.getState().armReferralPrompt('level-5')

    expect(store.getState().armedPrompt).toEqual({
      kind: 'review',
      milestoneKey: 'review-level-5',
    })
  })

  it('lets the consent prompt outrank every other kind for the armed slot', () => {
    const store = createStoreHarness()

    store.getState().armReviewPrompt('review-streak-7')
    store.getState().armMilestoneSharePrompt('share-streak-7')
    store.getState().armReferralPrompt('level-5')
    store.getState().armConsentPrompt(MARKETING_CONSENT_MILESTONE_KEY)

    expect(store.getState().armedPrompt).toEqual({
      kind: 'consent',
      milestoneKey: MARKETING_CONSENT_MILESTONE_KEY,
    })
  })

  it('keeps the armed consent prompt when any lower-priority prompt arms after', () => {
    const store = createStoreHarness()

    store.getState().armConsentPrompt(MARKETING_CONSENT_MILESTONE_KEY)
    store.getState().armReviewPrompt('review-streak-7')

    expect(store.getState().armedPrompt).toEqual({
      kind: 'consent',
      milestoneKey: MARKETING_CONSENT_MILESTONE_KEY,
    })
  })
})

describe('consent prompt cooldown bypass', () => {
  it('arms even when another prompt fired inside the shared cooldown window', () => {
    const store = createStoreHarness()

    store.getState().markEngagementPrompted('share-streak-7', '2026-06-27T12:00:00.000Z')
    store.getState().armConsentPrompt(MARKETING_CONSENT_MILESTONE_KEY)

    expect(store.getState().armedPrompt).toEqual({
      kind: 'consent',
      milestoneKey: MARKETING_CONSENT_MILESTONE_KEY,
    })
  })

  it('records markEngagementPrompted on show so other prompts treat consent as recent', () => {
    const store = createStoreHarness()
    const now = '2026-06-27T12:00:00.000Z'

    store.getState().armConsentPrompt(MARKETING_CONSENT_MILESTONE_KEY)
    store.getState().markEngagementPrompted(MARKETING_CONSENT_MILESTONE_KEY, now)

    expect(store.getState().lastPromptedAtIso).toBe(now)
    expect(store.getState().armedPrompt).toBeNull()
    expect(canPromptEngagement(store.getState(), 'level-3', now)).toBe(false)
  })
})

describe('migratePersistedEngagementPromptState', () => {
  it('coerces malformed persisted state to safe defaults', () => {
    expect(migratePersistedEngagementPromptState(undefined)).toEqual({
      promptedMilestoneKeys: [],
      lastPromptedAtIso: null,
      homeEntryDismissed: false,
      socialEntryDismissed: false,
    })

    expect(
      migratePersistedEngagementPromptState({
        promptedMilestoneKeys: ['share-streak-7', 42, 'level-2'],
        lastPromptedAtIso: 7,
        homeEntryDismissed: 'yes',
        socialEntryDismissed: 'yes',
      }),
    ).toEqual({
      promptedMilestoneKeys: ['share-streak-7', 'level-2'],
      lastPromptedAtIso: null,
      homeEntryDismissed: false,
      socialEntryDismissed: false,
    })
  })
})

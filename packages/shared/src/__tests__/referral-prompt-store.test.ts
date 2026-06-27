import { describe, expect, it } from 'vitest'
import {
  REFERRAL_PROMPT_COOLDOWN_DAYS,
  canPromptReferral,
  createReferralPromptStoreState,
  getPersistedReferralPromptState,
  getReferralLevelMilestone,
  getReferralStreakMilestone,
  migratePersistedReferralPromptState,
  parseReferralMilestoneKey,
  type ReferralPromptStoreState,
} from '../stores/referral-prompt-store'

function createStoreHarness() {
  let state = {} as ReferralPromptStoreState

  const set = (
    partial:
      | Partial<ReferralPromptStoreState>
      | ((current: ReferralPromptStoreState) => Partial<ReferralPromptStoreState>),
  ) => {
    const next = typeof partial === 'function' ? partial(state) : partial
    state = { ...state, ...next }
  }

  state = createReferralPromptStoreState(set)

  return {
    getState: () => state,
  }
}

const DAY_MS = 24 * 60 * 60 * 1000

describe('getReferralStreakMilestone', () => {
  it('returns milestone keys for 7, 30, and 100', () => {
    expect(getReferralStreakMilestone(7)).toBe('streak-7')
    expect(getReferralStreakMilestone(30)).toBe('streak-30')
    expect(getReferralStreakMilestone(100)).toBe('streak-100')
  })

  it('returns null for non-milestone streaks', () => {
    for (const streak of [0, 6, 8, 14, 29, 99, 101, 365]) {
      expect(getReferralStreakMilestone(streak)).toBeNull()
    }
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

describe('canPromptReferral', () => {
  const now = '2026-06-27T12:00:00.000Z'

  it('allows a fresh milestone with no prior prompt', () => {
    expect(
      canPromptReferral(
        { promptedMilestoneKeys: [], lastPromptedAtIso: null },
        'streak-7',
        now,
      ),
    ).toBe(true)
  })

  it('blocks a milestone that was already prompted', () => {
    expect(
      canPromptReferral(
        { promptedMilestoneKeys: ['streak-7'], lastPromptedAtIso: null },
        'streak-7',
        now,
      ),
    ).toBe(false)
  })

  it('blocks a new milestone while within the cooldown window', () => {
    const lastPromptedAtIso = new Date(
      new Date(now).getTime() - (REFERRAL_PROMPT_COOLDOWN_DAYS - 1) * DAY_MS,
    ).toISOString()

    expect(
      canPromptReferral(
        { promptedMilestoneKeys: ['streak-7'], lastPromptedAtIso },
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
      canPromptReferral(
        { promptedMilestoneKeys: ['streak-7'], lastPromptedAtIso },
        'level-3',
        now,
      ),
    ).toBe(true)
  })
})

describe('referral prompt store factory', () => {
  it('arms and clears the transient milestone key', () => {
    const store = createStoreHarness()

    store.getState().armReferralPrompt('streak-30')
    expect(store.getState().armedMilestoneKey).toBe('streak-30')

    store.getState().clearArmedMilestone()
    expect(store.getState().armedMilestoneKey).toBeNull()
  })

  it('records a prompted milestone, sets the timestamp, and clears the armed key', () => {
    const store = createStoreHarness()

    store.getState().armReferralPrompt('streak-7')
    store.getState().markReferralPrompted('streak-7', '2026-06-27T12:00:00.000Z')

    expect(store.getState().promptedMilestoneKeys).toEqual(['streak-7'])
    expect(store.getState().lastPromptedAtIso).toBe('2026-06-27T12:00:00.000Z')
    expect(store.getState().armedMilestoneKey).toBeNull()
  })

  it('does not duplicate an already-recorded milestone key', () => {
    const store = createStoreHarness()

    store.getState().markReferralPrompted('streak-7', '2026-06-01T00:00:00.000Z')
    store.getState().markReferralPrompted('streak-7', '2026-06-27T12:00:00.000Z')

    expect(store.getState().promptedMilestoneKeys).toEqual(['streak-7'])
    expect(store.getState().lastPromptedAtIso).toBe('2026-06-27T12:00:00.000Z')
  })

  it('flips the home-entry dismissed flag', () => {
    const store = createStoreHarness()

    expect(store.getState().homeEntryDismissed).toBe(false)
    store.getState().dismissHomeEntry()
    expect(store.getState().homeEntryDismissed).toBe(true)
  })

  it('omits the armed key from the persisted snapshot', () => {
    const store = createStoreHarness()

    store.getState().armReferralPrompt('streak-100')
    store.getState().dismissHomeEntry()

    const snapshot = getPersistedReferralPromptState(store.getState())

    expect(snapshot).not.toHaveProperty('armedMilestoneKey')
    expect(snapshot).toEqual({
      promptedMilestoneKeys: [],
      lastPromptedAtIso: null,
      homeEntryDismissed: true,
    })
  })
})

describe('migratePersistedReferralPromptState', () => {
  it('coerces malformed persisted state to safe defaults', () => {
    expect(migratePersistedReferralPromptState(undefined)).toEqual({
      promptedMilestoneKeys: [],
      lastPromptedAtIso: null,
      homeEntryDismissed: false,
    })

    expect(
      migratePersistedReferralPromptState({
        promptedMilestoneKeys: ['streak-7', 42, 'level-2'],
        lastPromptedAtIso: 7,
        homeEntryDismissed: 'yes',
      }),
    ).toEqual({
      promptedMilestoneKeys: ['streak-7', 'level-2'],
      lastPromptedAtIso: null,
      homeEntryDismissed: false,
    })
  })
})

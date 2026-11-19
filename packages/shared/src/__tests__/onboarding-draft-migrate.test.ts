import { describe, expect, it } from 'vitest'
import { createStore } from 'zustand/vanilla'
import {
  createOnboardingDraftState,
  getPersistedOnboardingDraft,
  mergeOnboardingDraft,
  migrateOnboardingDraft,
  type OnboardingDraftState,
} from '../stores/onboarding-draft'

function makeStore() {
  return createStore<OnboardingDraftState>((set, get) => createOnboardingDraftState(set, get))
}

describe('migrateOnboardingDraft habit sanitization', () => {
  it('drops non-object and unparseable habit entries', () => {
    expect(migrateOnboardingDraft({ habits: [123, 'nope', null] }).habits).toEqual([])
    expect(migrateOnboardingDraft({ habits: 'not-an-array' }).habits).toEqual([])
  })

  it('retains a valid buffered habit shape', () => {
    const migrated = migrateOnboardingDraft({ habits: [{ title: 'Drink water' }] })

    expect(migrated.habits).toHaveLength(1)
    expect(migrated.habits[0]?.title).toBe('Drink water')
  })
})

describe('onboarding draft snapshot', () => {
  it('clones the buffered first log into the snapshot', () => {
    const store = makeStore()

    store.getState().bufferFirstLog(1, '2026-07-05')

    const snapshot = getPersistedOnboardingDraft(store.getState())

    expect(snapshot.firstLog).toEqual({ habitIndex: 1, date: '2026-07-05' })
    expect(snapshot.firstLog).not.toBe(store.getState().firstLog)
  })
})

describe('mergeOnboardingDraft', () => {
  const fresh = { onboardingLocallyDone: false, introSeen: false }
  const stored = { accountKey: 'account-a', habits: [{ title: 'Drink water' }], weekStartDay: 1, onboardingLocallyDone: false, introSeen: true }

  it('keeps the stored answers for the account that stored them', () => {
    expect(mergeOnboardingDraft(stored, fresh, 'account-a')).toMatchObject({ accountKey: 'account-a', habits: [{ title: 'Drink water' }], weekStartDay: 1, onboardingLocallyDone: true, introSeen: true })
  })

  it('keeps the stored answers while nobody is signed in, and leaves onboarding open', () => {
    expect(mergeOnboardingDraft({ ...stored, accountKey: null }, fresh, null)).toMatchObject({ accountKey: null, habits: [{ title: 'Drink water' }], onboardingLocallyDone: false, introSeen: true })
  })

  it('drops the answers of another account and keeps the intro of this install as seen', () => {
    expect(mergeOnboardingDraft(stored, fresh, 'account-b')).toMatchObject({ accountKey: null, habits: [], weekStartDay: null, onboardingLocallyDone: true, introSeen: true })
  })

  it('keeps the intro the running session showed when the stored draft has none', () => {
    expect(mergeOnboardingDraft({ accountKey: 'account-a', habits: [] }, { onboardingLocallyDone: true, introSeen: true }, 'account-b')).toMatchObject({ onboardingLocallyDone: true, introSeen: true })
    expect(mergeOnboardingDraft(null, fresh, null)).toMatchObject({ habits: [], onboardingLocallyDone: false, introSeen: false })
  })
})

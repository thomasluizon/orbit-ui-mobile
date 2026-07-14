import { describe, expect, it } from 'vitest'
import { createStore } from 'zustand/vanilla'
import {
  createOnboardingDraftState,
  getPersistedOnboardingDraft,
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

describe('onboarding draft store step and snapshot', () => {
  it('updates the step and clones the buffered first log into the snapshot', () => {
    const store = makeStore()

    store.getState().setStep(4)
    store.getState().bufferFirstLog(1, '2026-07-05')

    const snapshot = getPersistedOnboardingDraft(store.getState())

    expect(snapshot.step).toBe(4)
    expect(snapshot.firstLog).toEqual({ habitIndex: 1, date: '2026-07-05' })
    expect(snapshot.firstLog).not.toBe(store.getState().firstLog)
  })
})

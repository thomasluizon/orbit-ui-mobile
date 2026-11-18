import { createElement, useState } from 'react'
import { act, create } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createUseGuidedOnboardingNavigation, type GuidedOnboardingNavigationState } from '../hooks/guided-onboarding-navigation-core'
import { ONBOARDING_REMIND_STEP, ONBOARDING_WHAT_STEP, ONBOARDING_WHEN_STEP } from '../utils/onboarding'

const useGuidedOnboardingNavigation = createUseGuidedOnboardingNavigation({ useState })

function mountNavigation(step: number, { introSeen = true, needsCadence = false } = {}) {
  const readIntroSeen = vi.fn(() => introSeen)
  const readNeedsCadence = vi.fn(() => needsCadence)
  let state!: GuidedOnboardingNavigationState
  function NavigationProbe(props: { step: number; phraseReads: number }) {
    state = useGuidedOnboardingNavigation({ step: props.step, phraseReads: props.phraseReads, readIntroSeen, readNeedsCadence })
    return null
  }
  let tree!: ReturnType<typeof create>
  let phraseReads = 0
  void act(() => { tree = create(createElement(NavigationProbe, { step, phraseReads })) })
  let currentStep = step
  return {
    get state() { return state },
    readIntroSeen,
    readNeedsCadence,
    moveTo: (next: number) => { currentStep = next; void act(() => tree.update(createElement(NavigationProbe, { step: next, phraseReads }))) },
    settlePhraseRead: () => { phraseReads += 1; void act(() => tree.update(createElement(NavigationProbe, { step: currentStep, phraseReads }))) },
    unmount: () => { void act(() => tree.unmount()) },
  }
}

describe('shared guided onboarding navigation', () => {
  beforeEach(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true))
  afterEach(() => vi.unstubAllGlobals())

  it('opens the intro on a first run of the first step, and reads the stored intro fact one time', () => {
    const mounted = mountNavigation(ONBOARDING_WHAT_STEP, { introSeen: false })
    expect(mounted.state.introRun).toBe(true)
    expect(mounted.state.navigation).toEqual({ view: 'talk', direction: 1, cadencePath: [], editing: false, walking: false, pendingEdit: null })
    void act(() => mounted.state.go('what', 1))
    expect(mounted.state.introRun, 'a later render keeps the first answer').toBe(true)
    expect(mounted.readIntroSeen).toHaveBeenCalledTimes(1)
    mounted.unmount()
  })

  it('opens the view of the step without the intro when the person saw it or the flow resumes on a later step', () => {
    expect(mountNavigation(ONBOARDING_WHAT_STEP).state.navigation.view).toBe('what')
    const resumed = mountNavigation(ONBOARDING_WHEN_STEP, { introSeen: false })
    expect(resumed.state.introRun).toBe(false)
    expect(resumed.state.navigation.view).toBe('summary')
    expect(mountNavigation(ONBOARDING_REMIND_STEP).state.navigation.view).toBe('remind')
  })

  it('opens the first repeat question after the phrase step when the draft needs a repeat', () => {
    const mounted = mountNavigation(ONBOARDING_WHAT_STEP, { needsCadence: true })
    expect(mounted.readNeedsCadence, 'no step change yet').not.toHaveBeenCalled()
    mounted.moveTo(ONBOARDING_WHEN_STEP)
    expect(mounted.state.navigation).toMatchObject({ view: 'mode', direction: 1, cadencePath: ['mode'], editing: false })
    expect(mounted.readNeedsCadence).toHaveBeenCalledTimes(1)
    mounted.unmount()
  })

  it('opens the summary after the phrase step when the phrase gave the repeat, and goes back to the phrase with a back direction', () => {
    const mounted = mountNavigation(ONBOARDING_WHAT_STEP)
    mounted.moveTo(ONBOARDING_WHEN_STEP)
    expect(mounted.state.navigation).toMatchObject({ view: 'summary', direction: 1, cadencePath: [] })
    mounted.moveTo(ONBOARDING_WHAT_STEP)
    expect(mounted.state.navigation).toMatchObject({ view: 'what', direction: -1, editing: false, cadencePath: [] })
    mounted.unmount()
  })

  it('leaves the phrase view for the summary when a phrase edited from the summary settles with no step change', () => {
    const mounted = mountNavigation(ONBOARDING_WHEN_STEP)
    void act(() => mounted.state.go('what', 1, { editing: true }))
    expect(mounted.state.navigation).toMatchObject({ view: 'what', editing: true })
    mounted.settlePhraseRead()
    expect(mounted.state.navigation).toMatchObject({ view: 'summary', direction: 1, editing: false, cadencePath: [] })
    expect(mounted.readNeedsCadence).toHaveBeenCalledTimes(1)
    mounted.unmount()
  })

  it('opens the first repeat question when the phrase edited from the summary needs a repeat', () => {
    const mounted = mountNavigation(ONBOARDING_WHEN_STEP, { needsCadence: true })
    void act(() => mounted.state.go('what', 1, { editing: true }))
    mounted.settlePhraseRead()
    expect(mounted.state.navigation).toMatchObject({ view: 'mode', cadencePath: ['mode'], editing: false })
    mounted.unmount()
  })

  it('reads the new phrase once when the step and the read change in the same render', () => {
    const mounted = mountNavigation(ONBOARDING_WHAT_STEP)
    mounted.settlePhraseRead()
    mounted.moveTo(ONBOARDING_WHEN_STEP)
    expect(mounted.state.navigation.view).toBe('summary')
    mounted.unmount()
  })

  it('moves to a view with its direction and patch, and keeps every other fact of the navigation', () => {
    const mounted = mountNavigation(ONBOARDING_WHAT_STEP, { needsCadence: true })
    mounted.moveTo(ONBOARDING_WHEN_STEP)
    void act(() => mounted.state.go('summary', 1, { editing: true, pendingEdit: 'mode' }))
    expect(mounted.state.navigation).toEqual({ view: 'summary', direction: 1, cadencePath: ['mode'], editing: true, walking: false, pendingEdit: 'mode' })
    mounted.unmount()
  })

  it('gives no back action with no target, the step action for the step target, and a back move for a view target', () => {
    const mounted = mountNavigation(ONBOARDING_WHAT_STEP, { needsCadence: true })
    mounted.moveTo(ONBOARDING_WHEN_STEP)
    const onStepBack = vi.fn()
    expect(mounted.state.backAction(null, onStepBack)).toBeUndefined()
    expect(mounted.state.backAction('step', onStepBack)).toBe(onStepBack)
    expect(mounted.state.backAction('step', undefined), 'the first step has no previous step').toBeUndefined()
    void act(() => mounted.state.go('summary', 1, { editing: true }))
    const backToMode = mounted.state.backAction('mode', onStepBack)
    void act(() => backToMode?.())
    expect(mounted.state.navigation).toMatchObject({ view: 'mode', direction: -1, editing: false })
    expect(onStepBack).not.toHaveBeenCalled()
    mounted.unmount()
  })
})

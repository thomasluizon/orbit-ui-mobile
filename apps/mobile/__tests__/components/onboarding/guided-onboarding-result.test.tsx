import React from 'react'
import { StyleSheet } from 'react-native'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { testI18n } from '@/__tests__/support/i18n'
import { GuidedOnboardingResult } from '@/components/onboarding/guided-onboarding-result'
import { useOnboardingDraftStore } from '@/stores/onboarding-draft-store'

const mocks = vi.hoisted(() => ({
  language: 'pt-BR',
  detail: { data: undefined as Record<string, unknown> | undefined, isError: false, isFetching: false, refetch: vi.fn() },
}))
vi.mock('react-i18next', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-i18next')>()),
  useTranslation: () => ({ t: testI18n.getFixedT(mocks.language), i18n: { language: mocks.language } }),
}))
vi.mock('@/hooks/use-habit-queries', () => ({ useHabitDetail: () => mocks.detail }))
vi.mock('@/hooks/use-time-format', () => ({ useTimeFormat: () => ({ displayTime: (time: string | null | undefined) => time ?? '' }) }))

interface TestNode { type: unknown; props: Record<string, unknown>; children: unknown[]; findAll(predicate: (node: TestNode) => boolean): TestNode[] }
interface TestTree { root: TestNode; unmount(): void }
const TestRenderer: { create(element: React.ReactNode): TestTree; act(callback: () => void | Promise<void>): Promise<void> } = require('react-test-renderer')
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const savedHabit = { id: 'habit-1', title: 'Correr', isGeneral: false, dueDate: '2026-11-16', dueTime: '07:00', frequencyUnit: 'Day', frequencyQuantity: 1, isFlexible: false, days: [], intervalWeeks: 1 }
const optimistic = savedHabit as never
const onPrimary = vi.fn()
const onClose = vi.fn()
let tree: TestTree | null = null

async function mount(props: { habitId: string | null; signedOut?: boolean }) {
  await TestRenderer.act(() => {
    tree = TestRenderer.create(<GuidedOnboardingResult habitId={props.habitId} optimistic={optimistic} signedOut={props.signedOut ?? false} timeZone="UTC" onPrimary={onPrimary} onClose={onClose} />)
  })
  return tree!
}
const hosts = (current: TestTree, testID: string) => current.root.findAll((node) => typeof node.type === 'string' && node.props.testID === testID)
const retryAction = (current: TestTree, label: string) => current.root.findAll((node) => typeof node.type === 'string' && node.props.accessibilityLabel === label && node.props.accessibilityRole === 'button')[0]

beforeEach(() => {
  mocks.detail = { data: undefined, isError: false, isFetching: false, refetch: vi.fn() }
  onPrimary.mockReset()
  onClose.mockReset()
})
afterEach(async () => { if (tree) await TestRenderer.act(() => tree!.unmount()); tree = null })

describe.each([{ language: 'pt-BR', copy: ptBR }, { language: 'en', copy: en }] as const)('the Android onboarding result dialog in $language', ({ language, copy }) => {
  beforeEach(() => { mocks.language = language })

  it('states a failed read of the saved habit with Orbit in Parado and a retry, and never the done title', async () => {
    mocks.detail.isError = true
    const current = await mount({ habitId: 'habit-1' })
    const panel = hosts(current, 'onboarding-result-error')[0]!
    expect(panel.props.accessibilityLabel).toBe(copy.onboarding.flow.done.readFailed)
    expect(StyleSheet.flatten(panel.props.style)).toMatchObject({ gap: 24 })
    expect(panel.findAll((node) => typeof node.type === 'string' && node.props.testID === 'orbit-mascot')[0]!.props['data-orbit-state' as never]).toBe('parado')
    expect(current.root.findAll((node) => typeof node.type === 'string' && node.props.accessibilityRole === 'alert').map((node) => node.props.accessibilityLabel)).toEqual([copy.onboarding.flow.done.readFailed])
    expect(hosts(current, 'result-dialog')).toHaveLength(0)
    await TestRenderer.act(() => { (retryAction(current, copy.common.retry)!.props.onPress as () => void)() })
    expect(mocks.detail.refetch).toHaveBeenCalledOnce()
  })

  it('keeps the retry busy while the read runs again', async () => {
    mocks.detail.isError = true
    mocks.detail.isFetching = true
    const current = await mount({ habitId: 'habit-1' })
    expect(retryAction(current, copy.common.retry)!.props.accessibilityState).toMatchObject({ busy: true })
  })

  it('opens the done dialog with the sentence of the saved habit once the read succeeds', async () => {
    mocks.detail.data = savedHabit
    const current = await mount({ habitId: 'habit-1' })
    expect(hosts(current, 'result-dialog')[0]!.props.accessibilityLabel).toBe(copy.result.title)
    expect(hosts(current, 'onboarding-result-error')).toHaveLength(0)
  })

  it('answers a queued create from the optimistic record, with no read and no error', async () => {
    mocks.detail.isError = true
    const current = await mount({ habitId: 'offline-42' })
    expect(hosts(current, 'result-dialog')).toHaveLength(1)
    expect(hosts(current, 'onboarding-result-error')).toHaveLength(0)
  })

  it('shows nothing while the first read runs, and nothing when no habit was created', async () => {
    mocks.detail.isFetching = true
    const loading = await mount({ habitId: 'habit-1' })
    expect(hosts(loading, 'result-dialog-centre')).toHaveLength(0)
    await TestRenderer.act(() => loading.unmount())
    const none = await mount({ habitId: null })
    expect(hosts(none, 'result-dialog-centre')).toHaveLength(0)
  })

  it('states the miss when the habit that waits on this device is not in the store, and reads the store again on retry', async () => {
    await TestRenderer.act(() => { useOnboardingDraftStore.setState({ habits: [] }) })
    const rehydrate = vi.spyOn(useOnboardingDraftStore.persist, 'rehydrate').mockResolvedValue(undefined)
    const current = await mount({ habitId: '0', signedOut: true })
    expect(hosts(current, 'onboarding-result-error')).toHaveLength(1)
    await TestRenderer.act(() => { (retryAction(current, copy.common.retry)!.props.onPress as () => void)() })
    expect(rehydrate).toHaveBeenCalledOnce()
    rehydrate.mockRestore()
  })
})

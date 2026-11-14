import React from 'react'
import TestRenderer, { act, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockGoal, createMockProfile } from '@orbit/shared/__tests__/factories'
import type { GoalDetailWithMetrics } from '@orbit/shared/types/goal'
import { formatLocaleDate } from '@orbit/shared/utils'
import { GoalDetailDrawer } from '@/components/goals/goal-detail-drawer'
import { i18n } from '@/lib/i18n'
import { useChatStore } from '@/stores/chat-store'
import { useUIStore } from '@/stores/ui-store'

const mocks = vi.hoisted(() => ({
  guided: true,
  reducedMotion: false,
  push: vi.fn(),
  updateStatus: vi.fn(),
  updateProgress: vi.fn(),
  deleted: vi.fn(),
  undo: vi.fn(),
  release: vi.fn(),
  t: { current: (key: string, values?: Record<string, unknown>) => values ? `${key}:${JSON.stringify(values)}` : key, language: 'en' },
}))

const ORBIT_STATES = ['parado', 'olhando', 'pensando', 'feliz', 'descansando']
const listGoal = createMockGoal({ id: '1', title: 'Read 12 books', currentValue: 3, targetValue: 12, unit: 'books', progressPercentage: 25 })
let detailGoal: GoalDetailWithMetrics['goal'] = { ...listGoal, progressHistory: [] }

/** The local test renderer types expose `findAll` only, and props as unknown. */
const byProp = (root: ReactTestInstance, name: string, value: unknown) => root.findAll((node) => node.props[name] === value)[0]!
const allByProp = (root: ReactTestInstance, name: string, value: unknown) => root.findAll((node) => node.props[name] === value)
const call = (node: ReactTestInstance, prop: string, ...values: unknown[]) => (node.props[prop] as (...args: unknown[]) => unknown)(...values)
const isType = (node: ReactTestInstance, name: string) => String(node.type) === name

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => undefined },
  useTranslation: () => ({ t: (key: string, values?: Record<string, unknown>) => mocks.t.current(key, values), i18n: { language: mocks.t.language } }),
}))
vi.mock('expo-router', () => ({ useRouter: () => ({ push: mocks.push }) }))
vi.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) }))
vi.mock('@/hooks/use-app-toast', () => ({ useAppToast: () => ({ showError: vi.fn() }) }))
vi.mock('@/lib/use-app-theme', () => ({ useAppTheme: () => ({ currentScheme: 'orange', currentTheme: 'dark' }) }))
vi.mock('@/lib/motion', async (original) => ({ ...await original<typeof import('@/lib/motion')>(), usePrefersReducedMotion: () => mocks.reducedMotion }))
vi.mock('@/components/ui/sheet', async () => await import('@/__tests__/support/sheet-double'))
vi.mock('@/hooks/use-flag', () => ({ useFlag: () => mocks.guided }))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: createMockProfile({ timeZone: 'UTC' }) }) }))
vi.mock('@/components/goals/edit-goal-modal', () => ({ EditGoalModal: () => null }))
vi.mock('@/hooks/use-goals', () => ({
  useGoals: () => ({ data: { allGoals: [listGoal], goalsById: new Map([['1', listGoal]]) } }),
  useGoalDetail: (id: string | null) => ({
    data: id ? { goal: detailGoal, metrics: { progressPercentage: detailGoal.progressPercentage, velocityPerDay: 0, projectedCompletionDate: null, daysToDeadline: null, trackingStatus: 'no_deadline', habitAdherence: [] } } : null,
    isLoading: false,
    isError: false,
    refetch: vi.fn().mockResolvedValue(undefined),
  }),
  useUpdateGoalProgress: () => ({ mutateAsync: mocks.updateProgress, isPending: false, error: null }),
  useUpdateGoalStatus: () => ({ mutateAsync: mocks.updateStatus, isPending: false, error: null }),
  useDeleteGoal: (options?: { onDeleted?: (actions: { undo: () => void; release?: () => void }) => void }) => ({
    mutateAsync: (goalId: string) => { mocks.deleted(goalId); options?.onDeleted?.({ undo: mocks.undo, release: mocks.release }); return Promise.resolve() },
    isPending: false,
    error: null,
  }),
}))

let tree: ReactTestRenderer
const onClose = vi.fn()
async function renderDetail(inline = true) {
  await act(async () => { tree = TestRenderer.create(<GoalDetailDrawer inline={inline} open goalId="1" onClose={onClose} />); await Promise.resolve() })
}
async function useCatalog(locale: 'en' | 'pt-BR') {
  await i18n.changeLanguage(locale)
  mocks.t.current = (key, values) => i18n.t(key, values)
  mocks.t.language = locale
}
function flattenText(node: unknown): string {
  if (node == null) return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(flattenText).join('')
  if (typeof node === 'object' && 'props' in node) return flattenText((node as { props: { children?: unknown } }).props.children)
  return ''
}
const pressables = (label: string) => tree.root.findAll((node) => (node.props.accessibilityLabel ?? flattenText(node.props.children)) === label && typeof node.props.onPress === 'function')
async function press(label: string) {
  const [node] = pressables(label)
  if (!node) throw new Error(`Button not found: ${label}`)
  await act(async () => { await call(node, 'onPress'); await Promise.resolve() })
}
const resultDialog = () => tree.root.findAll((node) => node.props.testID === 'result-dialog' && typeof node.type === 'string')[0]
const resultOrbitState = () => byProp(byProp(tree.root, 'testID', 'result-dialog-orbit'), 'testID', 'orbit-mascot').props['data-orbit-state'] as string
async function changeEntry(label: string, value: string) {
  const input = tree.root.findAll((node) => node.props.accessibilityLabel === label && typeof node.props.onChangeText === 'function')[0]!
  await act(() => { call(input, 'onChangeText', value) })
}
const detailRing = (): ReactTestInstance => byProp(tree.root, 'testID', 'goal-detail-ring')
const ringValue = () => (byProp(detailRing(), 'accessibilityRole', 'progressbar').props.accessibilityValue as { now: number }).now

describe('goal detail on the Orbit logic', () => {
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-13T12:00:00Z'))
    mocks.guided = true
    mocks.reducedMotion = false
    detailGoal = { ...listGoal, progressHistory: [] }
    for (const fn of [mocks.push, mocks.updateStatus, mocks.updateProgress, mocks.deleted, mocks.undo, mocks.release, onClose]) fn.mockReset()
    mocks.updateStatus.mockResolvedValue(undefined)
    await useCatalog('en')
    useChatStore.setState({ draft: '', draftHydrated: true, contextualSuggestion: null })
    useUIStore.setState({ astraConversationOpen: false })
  })
  afterEach(async () => { await act(() => tree.unmount()); vi.useRealTimers() })

  it.each([
    ['en', '2026-11-20', '7 days left until the deadline.'],
    ['pt-BR', '2026-11-20', 'Faltam 7 dias para o prazo.'],
    ['en', '2026-11-14', '1 day left until the deadline.'],
    ['pt-BR', '2026-11-14', 'Falta 1 dia para o prazo.'],
    ['en', '2026-11-13', 'The deadline is today.'],
    ['pt-BR', '2026-11-13', 'O prazo é hoje.'],
  ] as const)('states one date fact in the Orbit line in %s for %s', async (locale, deadline, sentence) => {
    await useCatalog(locale)
    detailGoal = { ...detailGoal, deadline }
    await renderDetail()
    const line = byProp(tree.root, 'testID', 'today-astra-slot')
    expect(line.props.accessibilityLabel).toBe(sentence)
    expect(byProp(line, 'testID', 'orbit-mascot').props['data-orbit-face'], 'the line row draws the still small face').toBe('small')
  })

  it('states a passed deadline with its date', async () => {
    detailGoal = { ...detailGoal, deadline: '2026-10-03' }
    await renderDetail()
    expect(byProp(tree.root, 'testID', 'today-astra-slot').props.accessibilityLabel).toBe(`The deadline was ${formatLocaleDate('2026-10-03', 'en')}.`)
  })

  it('opens the conversation with the seeded question from the line row, the one way in', async () => {
    detailGoal = { ...detailGoal, deadline: '2026-11-20' }
    await renderDetail()
    await press('7 days left until the deadline.')
    expect(useUIStore.getState().astraConversationOpen).toBe(true)
    expect(pressables(`${i18n.t('goals.detail.askAstraEyebrow')}: ${i18n.t('goals.detail.askAstraDefault')}`)).toHaveLength(0)
  })

  it('has no line with no deadline and keeps the ask row', async () => {
    await renderDetail()
    expect(allByProp(tree.root, 'testID', 'today-astra-slot')).toHaveLength(0)
    await press(`${i18n.t('goals.detail.askAstraEyebrow')}: ${i18n.t('goals.detail.askAstraDefault')}`)
    expect(useUIStore.getState().astraConversationOpen).toBe(true)
  })

  it('keeps the current detail with the flag off: no line and no result dialog', async () => {
    mocks.guided = false
    detailGoal = { ...detailGoal, deadline: '2026-11-20' }
    await renderDetail()
    expect(allByProp(tree.root, 'testID', 'today-astra-slot')).toHaveLength(0)
    await press(i18n.t('goals.detail.markAbandoned'))
    expect(mocks.updateStatus).toHaveBeenCalled()
    expect(resultDialog()).toBeUndefined()
  })

  it.each([
    ['Active', 'goals.detail.markAbandoned', 'The goal "Read 12 books" is marked as abandoned.', 'parado'],
    ['Abandoned', 'goals.detail.reactivate', 'The goal "Read 12 books" is active again.', 'feliz'],
  ] as const)('confirms a status change of a %s goal with the result dialog', async (status, action, sentence, orbitState) => {
    detailGoal = { ...detailGoal, status }
    await renderDetail()
    await press(i18n.t(action))
    expect(resultDialog()!.props.accessibilityLabel).toBe(i18n.t('result.title'))
    expect(resultDialog()!.props.accessibilityHint).toBe(sentence)
    expect(resultOrbitState()).toBe(orbitState)
    await press(i18n.t('result.goal.open'))
    expect(resultDialog()).toBeUndefined()
    expect(onClose, 'the goal detail stays open under the dialog').not.toHaveBeenCalled()
  })

  it('confirms a delete with Orbit at rest and no mascot in the confirmation, then opens the goals list', async () => {
    await renderDetail(false)
    await press(i18n.t('goals.detail.delete'))
    const confirmation = tree.root.findAll((node) => node.props.testID === 'button-destructive-sm')
    const confirmSheet = tree.root.findAll((node) => node.props.title === i18n.t('goals.detail.delete') && node.props.destructive === true)[0]!
    expect(confirmSheet.findAll((node) => node.props.testID === 'orbit-mascot'), 'no mascot inside a destructive confirmation').toHaveLength(0)
    expect(confirmSheet.findAll((node) => node.props.testID === 'button-destructive-sm')).not.toHaveLength(0)
    await act(async () => { await call(confirmation.at(-1)!, 'onPress'); await Promise.resolve() })
    expect(mocks.deleted).toHaveBeenCalledWith('1')
    expect(resultDialog()!.props.accessibilityHint).toBe('The goal "Read 12 books" was deleted.')
    expect(resultOrbitState()).toBe('parado')
    await press(i18n.t('result.goal.openList'))
    expect(mocks.release, 'the dialog lets go of the undo as the toast does').toHaveBeenCalledOnce()
    expect(mocks.push).toHaveBeenCalledWith('/progress/goals')
  })

  it('runs the same undo from the delete dialog and keeps the goal detail', async () => {
    await renderDetail()
    await press(i18n.t('goals.detail.delete'))
    await act(async () => { await call(tree.root.findAll((node) => node.props.testID === 'button-destructive-sm').at(-1)!, 'onPress'); await Promise.resolve() })
    await press(i18n.t('undo.action'))
    expect(mocks.undo).toHaveBeenCalledOnce()
    expect(resultDialog()).toBeUndefined()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('asks one question in the progress sheet, opens no result dialog and sweeps the ring once', async () => {
    mocks.updateProgress.mockImplementation(() => { detailGoal = { ...detailGoal, currentValue: 6, progressPercentage: 50 }; return Promise.resolve() })
    await renderDetail(false)
    await press(i18n.t('goals.updateProgress'))
    expect(tree.root.findAll((node) => node.props.accessibilityLabel === i18n.t('goals.form.progressNoteQuestion') && typeof node.props.onChangeText === 'function')).not.toHaveLength(0)
    await changeEntry(i18n.t('goals.form.progressQuestion'), '6')
    await press(i18n.t('common.save'))
    await act(async () => { await Promise.resolve() })
    expect(mocks.updateProgress).toHaveBeenCalled()
    expect(ringValue()).toBe(25)
    expect(detailRing().props['data-ring-sweep']).toBe('sweeping')
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 5)) })
    expect(ringValue()).toBe(50)
    expect(resultDialog(), 'a progress update keeps its in-place feedback').toBeUndefined()
  })

  it('draws the saved progress at once under reduced motion', async () => {
    mocks.reducedMotion = true
    mocks.updateProgress.mockImplementation(() => { detailGoal = { ...detailGoal, currentValue: 6, progressPercentage: 50 }; return Promise.resolve() })
    await renderDetail(false)
    await press(i18n.t('goals.updateProgress'))
    await changeEntry(i18n.t('goals.form.progressQuestion'), '6')
    await press(i18n.t('common.save'))
    await act(async () => { await Promise.resolve() })
    expect(ringValue()).toBe(50)
    expect(detailRing().props['data-ring-sweep']).toBe('rest')
  })

  it('never shows a sad state', async () => {
    detailGoal = { ...detailGoal, deadline: '2026-10-03' }
    await renderDetail()
    await press(i18n.t('goals.detail.markAbandoned'))
    const states = tree.root.findAll((node) => node.props.testID === 'orbit-mascot').map((node) => node.props['data-orbit-state'] as string)
    expect(states.length).toBeGreaterThan(0)
    expect(states.every((state) => ORBIT_STATES.includes(state))).toBe(true)
  })
})

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, type ReactTestInstance } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { createApiClientError } from '@orbit/shared/utils'
import { CreateHabitModal } from '@/components/habits/create-habit-modal'
import { i18n } from '@/lib/i18n'
import { dismissTopOverlay } from '@/lib/overlay-stack'
import { requestHabitCreateNavigation } from '@/hooks/use-habit-create-navigation-guard'
import { nativeWindows, press, renderNavigation } from '../ui/navigation-render'

const state = vi.hoisted(() => ({
  create: vi.fn(), update: vi.fn(), saved: null as Record<string, unknown> | null, completed: vi.fn(), push: vi.fn(), replace: vi.fn(), phraseRead: vi.fn(), subCreate: vi.fn(),
  detailPending: false, detailFetching: false, detailError: null as Error | null, refetchDetail: vi.fn(), showError: vi.fn(),
}))

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string, params?: Record<string, unknown>) => i18n.t(key, params), i18n: { language: i18n.language } }),
}))
vi.mock('expo-router', () => ({ useRouter: () => ({ push: state.push, replace: state.replace, back: vi.fn(), canGoBack: () => true }), useIsFocused: () => true, useLocalSearchParams: () => ({}) }))
vi.mock('expo-router/react-navigation', () => ({ usePreventRemove: vi.fn() }))
vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({ profile: { timeZone: 'UTC', uses24HourClock: true, weekStartDay: 0, aiMessagesUsed: 0, aiMessagesLimit: 5, hasProAccess: true } }),
  useHasProAccess: () => true,
}))
vi.mock('@/hooks/use-app-toast', () => ({ useAppToast: () => ({ showError: state.showError, showSuccess: vi.fn(), showInfo: vi.fn() }) }))
vi.mock('@/hooks/use-create-habit', () => ({ useCreateHabit: () => ({ mutateAsync: state.create, isPending: false }) }))
vi.mock('@/hooks/use-create-sub-habit', () => ({ useCreateSubHabit: () => ({ mutateAsync: state.subCreate, isPending: false }) }))
vi.mock('@/hooks/use-update-habit', () => ({ useUpdateHabit: () => ({ mutateAsync: state.update, isPending: false }) }))
vi.mock('@/hooks/use-habit-queries', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/hooks/use-habit-queries')>(),
  useHabitDetail: (id: string | null) => ({ data: id ? state.saved ?? undefined : undefined, isPending: state.detailPending, isFetching: state.detailFetching, error: state.detailError, refetch: state.refetchDetail, retry: state.refetchDetail }),
}))
vi.mock('@/hooks/use-habit-suggestion', () => ({ useHabitSuggestion: () => ({ mutateAsync: vi.fn(), isPending: false }) }))
vi.mock('@/hooks/use-habit-phrase-read', () => ({ useHabitPhraseRead: () => ({ mutateAsync: state.phraseRead, isPending: false }) }))
vi.mock('@/hooks/use-date-interpretation', () => ({ useDateInterpretation: () => ({ mutateAsync: vi.fn(), isPending: false }) }))
vi.mock('@/hooks/use-offline', () => ({ useOffline: () => ({ isOnline: true }) }))
vi.mock('@/hooks/use-reminder-permission', () => ({ useReminderPermission: (_enabled: boolean, onToggle: () => void) => ({ toggleReminder: onToggle, showNotice: false, requestPermission: vi.fn() }) }))
vi.mock('@/hooks/use-tags', () => ({
  useTags: () => ({ tags: [] }), useSuggestTags: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreateTag: () => ({ mutateAsync: vi.fn(), isPending: false }), useUpdateTag: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteTag: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
vi.mock('@/components/habits/goal-linking-field', () => ({ GoalLinkingField: () => null, useLinkableGoals: () => ({ data: [], isSuccess: true, isLoading: false, isError: false, refetch: vi.fn() }) }))
vi.mock('@/hooks/use-checklist-templates', () => ({
  useChecklistTemplates: () => ({ data: [], isLoading: false, isError: false, refetch: vi.fn() }),
  useCreateChecklistTemplate: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteChecklistTemplate: () => ({ mutate: vi.fn() }),
}))
vi.mock('@/lib/posthog', () => ({ captureGuidedFlowEvent: vi.fn(), captureGuidedFlowCompleted: state.completed }))

type Tree = ReturnType<typeof renderNavigation>
const control = (tree: Tree, name: string | RegExp) => tree.hosts().find((node) => (typeof name === 'string' ? node.props.accessibilityLabel === name : name.test(node.props.accessibilityLabel ?? '')) && typeof node.props.onPress === 'function')
const heading = (tree: Tree) => tree.hosts().filter((node) => node.props.accessibilityRole === 'header').map((node) => (typeof node.props.children === 'string' ? node.props.children : ''))[0] ?? ''
const hasTestId = (tree: Tree, testID: string) => tree.hosts().some((node) => node.props.testID === testID)
const rowMarked = (tree: Tree, name: RegExp) => tree.hosts().some((node) => node.props.testID === 'proposed-row'
  && (node as unknown as ReactTestInstance).findAll((child) => typeof child.type === 'string' && name.test((child.props as { accessibilityLabel?: string }).accessibilityLabel ?? '') && typeof child.props.onPress === 'function').length > 0)
async function settle() { await act(async () => { await Promise.resolve(); await Promise.resolve() }) }
async function tap(tree: Tree, name: string | RegExp) {
  const target = control(tree, name)
  if (!target) throw new Error(`no control named ${String(name)}`)
  await act(async () => { press(target); await Promise.resolve(); await Promise.resolve() })
}
async function primary(tree: Tree) {
  const action = tree.hosts().find((node) => node.props.testID === 'button-primary-sm' && typeof node.props.onPress === 'function')
  if (!action) throw new Error('no primary action')
  await act(async () => { press(action); await Promise.resolve(); await Promise.resolve() })
}
const proposedMarks = (tree: Tree) => tree.hosts().filter((node) => node.props.accessibilityLabel === ptBR.habits.detail.proposed).length
async function keepProposedAnswersToSummary(tree: Tree) {
  for (let guard = 0; guard < 5; guard += 1) {
    const text = heading(tree)
    if (text === ptBR.habits.flow.confirm.question) return
    if (text.startsWith(ptBR.habits.flow.reminder.question.split('{')[0]!.trim())) await tap(tree, ptBR.habits.flow.reminder.no)
    else await primary(tree)
  }
}
async function phrase(tree: Tree, text: string) {
  const input = tree.hosts().find((node) => (node.props as { onChangeText?: unknown }).onChangeText && node.props.accessibilityLabel === ptBR.habits.flow.what.label)!
  await act(async () => { (input.props as unknown as { onChangeText: (value: string) => void }).onChangeText(text); await Promise.resolve() })
  await primary(tree)
}

const limitError = (errorCode: 'HABIT_LIMIT_REACHED' | 'PAY_GATE') => createApiClientError(errorCode === 'PAY_GATE' ? 403 : 400, { error: 'Boundary', errorCode }, 'Boundary')
const noticeTexts = (tree: Tree) => tree.hosts().filter((node) => node.props.testID === 'capacity-notice').flatMap((node) => (node as unknown as ReactTestInstance).findAll((child) => (child.type as unknown) === 'Text').map((child) => String(child.props.children)))
const pillNamed = (tree: Tree, label: string) => tree.hosts().find((node) => String(node.props.testID ?? '').startsWith('button-') && typeof node.props.onPress === 'function'
  && (node as unknown as ReactTestInstance).findAll((child) => (child.type as unknown) === 'Text' && child.props.children === label).length > 0)
const submitAction = (tree: Tree) => tree.hosts().find((node) => node.props.testID === 'button-primary-sm' && typeof node.props.onPress === 'function')

async function reachSummary(tree: Tree) {
  await settle()
  await phrase(tree, 'ligar para o João')
  await tap(tree, ptBR.habits.flow.when.tomorrow)
  await tap(tree, '08:00')
  await tap(tree, ptBR.habits.flow.reminder.no)
}

beforeEach(async () => {
  await i18n.changeLanguage('pt-BR')
  state.create.mockReset()
  state.replace.mockReset()
  state.push.mockReset()
  state.completed.mockReset()
  state.showError.mockReset()
  state.phraseRead.mockReset().mockResolvedValue(null)
  vi.useFakeTimers({ now: new Date('2026-11-13T12:00:00Z'), toFake: ['Date'] })
})
afterEach(() => { vi.useRealTimers() })

describe('the guided create on Android when a queued log was dropped', () => {
  it('says why Criar opened, on the summary, beside the detail of the drop', async () => {
    const tree = renderNavigation(<QueryClientProvider client={new QueryClient()}><CreateHabitModal open onClose={vi.fn()} recoveryMessage="Criar Caminhada" /></QueryClientProvider>)
    await reachSummary(tree)
    expect(heading(tree)).toBe(ptBR.habits.flow.confirm.question)
    const expected = `Criar Caminhada ${ptBR.common.syncOrphanedDetail}`
    expect(tree.hosts().filter((node) => Array.isArray(node.props.children) && node.props.children.join('') === expected)).toHaveLength(1)
    tree.unmount()
  })

  it('shows no recovery line when the screen opened with no drop', async () => {
    const tree = renderNavigation(<QueryClientProvider client={new QueryClient()}><CreateHabitModal open onClose={vi.fn()} /></QueryClientProvider>)
    await reachSummary(tree)
    expect(tree.hosts().some((node) => Array.isArray(node.props.children) && node.props.children.join('').includes(ptBR.common.syncOrphanedDetail))).toBe(false)
    tree.unmount()
  })
})

describe('the create boundary of the guided create on Android', () => {
  it.each(['HABIT_LIMIT_REACHED', 'PAY_GATE'] as const)('shows the inline %s notice on the summary with no toast and no close, and a retry saves', async (errorCode) => {
    state.create.mockRejectedValueOnce(limitError(errorCode)).mockResolvedValueOnce({ id: 'habit-9' })
    const close = vi.fn()
    const tree = renderNavigation(<QueryClientProvider client={new QueryClient()}><CreateHabitModal open onClose={close} /></QueryClientProvider>)
    await reachSummary(tree)
    await primary(tree)
    expect(state.create).toHaveBeenCalledTimes(1)
    expect(noticeTexts(tree)).toContain(errorCode === 'PAY_GATE' ? ptBR.habits.form.proRequired : i18n.t('habits.form.capacityBody', { limit: 1000 }))
    expect(pillNamed(tree, ptBR.common.upgrade) !== undefined).toBe(errorCode === 'PAY_GATE')
    expect(state.showError).not.toHaveBeenCalled()
    expect(state.completed).not.toHaveBeenCalled()
    expect(close).not.toHaveBeenCalled()
    expect(heading(tree)).toBe(ptBR.habits.flow.confirm.question)
    expect(submitAction(tree)?.props.disabled).not.toBe(true)
    await primary(tree)
    expect(state.create).toHaveBeenCalledTimes(2)
    expect(state.completed).toHaveBeenCalledWith('habit_create', 5, false)
    tree.unmount()
  })

})

describe('the dismissal guard of the guided create on the Android create screen', () => {
  const mountScreen = () => {
    const onClose = vi.fn()
    const tree = renderNavigation(<QueryClientProvider client={new QueryClient()}><CreateHabitModal open presentation="screen" onClose={onClose} /></QueryClientProvider>)
    return { tree, onClose }
  }
  const discardOpen = (tree: Tree) => tree.hosts().some((node) => node.props.children === ptBR.common.discardChangesTitle)
  const systemBack = (): boolean => { let handled = false; act(() => { handled = dismissTopOverlay('system-back') }); return handled }

  it('leaves on a clean close with no discard sheet', async () => {
    const { tree, onClose } = mountScreen()
    await settle()
    await tap(tree, ptBR.habits.flow.close)
    expect(discardOpen(tree)).toBe(false)
    expect(onClose).toHaveBeenCalledOnce()
    tree.unmount()
  })

  it('guards Android Back on a draft, keeps editing, then leaves only after discard', async () => {
    const { tree, onClose } = mountScreen()
    await settle()
    await phrase(tree, 'Beber água')
    expect(systemBack()).toBe(true)
    expect(onClose).not.toHaveBeenCalled()
    expect(discardOpen(tree)).toBe(true)
    await act(async () => { press(pillNamed(tree, ptBR.common.keepEditing)!); await Promise.resolve() })
    expect(discardOpen(tree)).toBe(false)
    expect(onClose).not.toHaveBeenCalled()
    expect(systemBack()).toBe(true)
    expect(discardOpen(tree)).toBe(true)
    await act(async () => { press(pillNamed(tree, ptBR.common.discardChangesAction)!); await Promise.resolve() })
    expect(onClose).toHaveBeenCalledOnce()
    tree.unmount()
  })

  it.each(['keep', 'discard'] as const)('guards a notification bell press on a draft and handles %s without leaving the draft in history', async (choice) => {
    const { tree, onClose } = mountScreen()
    await settle()
    await phrase(tree, 'Beber água')
    const action = vi.fn()
    const creationExit = vi.fn()
    act(() => requestHabitCreateNavigation(action, creationExit))
    expect(discardOpen(tree)).toBe(true)
    expect(action).not.toHaveBeenCalled()
    expect(creationExit).not.toHaveBeenCalled()
    if (choice === 'keep') {
      await act(async () => { press(pillNamed(tree, ptBR.common.keepEditing)!); await Promise.resolve() })
      expect(discardOpen(tree)).toBe(false)
      expect(creationExit).not.toHaveBeenCalled()
      expect(onClose).not.toHaveBeenCalled()
    } else {
      await act(async () => { press(pillNamed(tree, ptBR.common.discardChangesAction)!); await Promise.resolve(); await Promise.resolve() })
      expect(creationExit).toHaveBeenCalledOnce()
      expect(action).not.toHaveBeenCalled()
      expect(onClose).not.toHaveBeenCalled()
    }
    tree.unmount()
  })

  it('lets a notification bell press through when no create screen guards it', () => {
    const action = vi.fn()
    const creationExit = vi.fn()
    requestHabitCreateNavigation(action, creationExit)
    expect(action).toHaveBeenCalledOnce()
    expect(creationExit).not.toHaveBeenCalled()
  })

  it('opens Upgrade from the pay boundary only after the guarded dismissal', async () => {
    state.create.mockRejectedValueOnce(limitError('PAY_GATE'))
    const close = vi.fn()
    const tree = renderNavigation(<QueryClientProvider client={new QueryClient()}><CreateHabitModal open onClose={close} /></QueryClientProvider>)
    await reachSummary(tree)
    await primary(tree)
    await act(async () => { press(pillNamed(tree, ptBR.common.upgrade)!); await Promise.resolve() })
    expect(discardOpen(tree)).toBe(true)
    expect(state.push).not.toHaveBeenCalled()
    expect(close).not.toHaveBeenCalled()
    await act(async () => { press(pillNamed(tree, ptBR.common.discardChangesAction)!); await Promise.resolve(); await Promise.resolve() })
    expect(state.push.mock.calls).toEqual([['/upgrade']])
    expect(close).toHaveBeenCalledOnce()
    expect(state.showError).not.toHaveBeenCalled()
    tree.unmount()
  })
})

import { useState } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { GuidedHabitFlow, type GuidedHabitFields } from '@/components/habits/guided/guided-habit-flow'
import { useHabitForm } from '@/hooks/use-habit-form'
import { useTagSelection } from '@/hooks/use-tag-selection'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'
import { compileAppStylesheet, measureFlowActions, stubViewportMedia } from '@/__tests__/support/flow-layout'

const state = vi.hoisted(() => ({ locale: 'pt-BR' as 'en' | 'pt-BR' }))

function lookup(messages: Record<string, unknown>, key: string): string {
  const value = key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], messages)
  return typeof value === 'string' ? value : key
}

vi.mock('next-intl', () => ({
  useLocale: () => state.locale,
  useTranslations: () => (key: string, values?: Record<string, string | number>) =>
    lookup(state.locale === 'en' ? en : ptBR, key).replaceAll(/\{(\w+)\}/g, (_match, name: string) => `${values?.[name] ?? ''}`),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: { timeZone: 'UTC', uses24HourClock: true, weekStartDay: 0, aiMessagesUsed: 0, aiMessagesLimit: 5 } }), useHasProAccess: () => true }))
vi.mock('@/hooks/use-habit-phrase-read', () => ({ useHabitPhraseRead: () => ({ mutateAsync: vi.fn().mockResolvedValue(null), isPending: false }) }))
vi.mock('@/hooks/use-offline', () => ({ useOffline: () => ({ isOnline: true }) }))
vi.mock('@/hooks/use-app-toast', () => ({ useAppToast: () => ({ showError: vi.fn(), showSuccess: vi.fn(), showInfo: vi.fn() }) }))
vi.mock('@/hooks/use-reminder-permission', () => ({ useReminderPermission: (_enabled: boolean, onToggle: () => void) => ({ toggleReminder: onToggle, showNotice: false }) }))
vi.mock('@/lib/posthog', () => ({ captureGuidedFlowEvent: vi.fn(), captureGuidedFlowCompleted: vi.fn() }))
vi.mock('@/hooks/use-checklist-templates', () => ({
  useChecklistTemplates: () => ({ data: [], isLoading: false, isError: false, refetch: vi.fn() }),
  useCreateChecklistTemplate: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteChecklistTemplate: () => ({ mutate: vi.fn() }),
}))
vi.mock('@/components/habits/goal-linking-field', () => ({ useLinkableGoals: () => ({ data: [], isSuccess: true, isLoading: false, isError: false, refetch: vi.fn() }) }))
vi.mock('@/components/goals/create-goal-sheet', () => ({ CreateGoalSheet: () => null }))
vi.mock('@/hooks/use-tags', () => ({
  useTags: () => ({ tags: [] }),
  useCreateTag: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useUpdateTag: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useDeleteTag: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useSuggestTags: () => ({ isPending: false, mutateAsync: vi.fn() }),
}))
vi.mock('@/hooks/use-habit-queries', () => ({ useHabits: () => ({ data: undefined }) }))
vi.mock('@/hooks/use-astra-allowance-copy', () => ({ useAstraAllowanceCopy: () => (key: string) => key }))

function Harness() {
  const formHelpers = useHabitForm({ initialData: { dueDate: '' } })
  const tags = useTagSelection()
  const [reminderTimes, setReminderTimes] = useState([0, 15])
  const fields: GuidedHabitFields = { tags, selectedGoalIds: [], atGoalLimit: false, onToggleGoal: vi.fn(), reminderTimes, onReminderTimesChange: setReminderTimes }
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <GuidedHabitFlow formHelpers={formHelpers} fields={fields} lockedGeneral={null} fromConversation={false} pending={false} saveError={null} createLabel="Criar tarefa" onSubmit={vi.fn()} onClose={vi.fn()} />
    </div>
  )
}

const flowCopy = () => (state.locale === 'en' ? en : ptBR).habits.flow
async function press(name: string | RegExp) {
  await act(async () => { fireEvent.click(screen.getByRole('button', { name })) })
}
async function toWhen() {
  await act(async () => { fireEvent.change(screen.getByLabelText(flowCopy().what.label), { target: { value: state.locale === 'en' ? 'call John' : 'ligar para o João' } }) })
  await press(flowCopy().continue)
}
async function toTemplateQuestion() {
  await toWhen()
  await press(flowCopy().when.noDate)
  await press(flowCopy().more)
  await press(new RegExp(flowCopy().optional.checklist.replace('?', '\\?')))
  await press(flowCopy().checklist.useTemplate)
}

const WIDE = 1440
const steps = { 'the free path of the date question': toWhen, 'the template question with no template': toTemplateQuestion }
const cases = (['pt-BR', 'en'] as const).flatMap((locale) => (Object.keys(steps) as (keyof typeof steps)[]).map((step) => ({ locale, step })))

describe('the actions of the guided habit steps at 1440 in Chromium', () => {
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string
  registerChromeLaunchHook(beforeAll, async (launch) => { browserLaunch = launch; browser = await launch })
  beforeAll(async () => { stylesheet = await compileAppStylesheet() }, 30_000)
  beforeEach(() => { vi.useFakeTimers({ now: new Date('2026-11-13T12:00:00Z'), toFake: ['Date'] }) })
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers() })
  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

  it.each(cases)('keeps every action of $step at most 360 wide and in the centre of the column in $locale', async ({ locale, step }) => {
    state.locale = locale
    stubViewportMedia(WIDE)
    const view = render(<Harness />)
    await steps[step]()
    const markup = view.container.innerHTML
    vi.useRealTimers()
    const actions = await measureFlowActions(browser, stylesheet, WIDE, markup)
    expect(actions.map((action) => action.label)).toContain(step === 'the free path of the date question' ? flowCopy().continue : flowCopy().templates.write)
    for (const action of actions) {
      expect(action.width, `${action.label} hugs its label: ${JSON.stringify(action)}`).toBeLessThanOrEqual(360)
      expect(action.centreOffset, `${action.label} sits in the centre: ${JSON.stringify(action)}`).toBeLessThanOrEqual(1)
    }
  }, 60_000)
})

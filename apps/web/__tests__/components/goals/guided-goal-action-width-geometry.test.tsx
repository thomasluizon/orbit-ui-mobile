import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { NextIntlClientProvider } from 'next-intl'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { CreateGoalSheet } from '@/components/goals/create-goal-sheet'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'
import { compileAppStylesheet, measureFlowActions, stubViewportMedia } from '@/__tests__/support/flow-layout'

vi.mock('@/hooks/use-flag', () => ({ useFlag: () => true }))
vi.mock('@/hooks/use-goals', () => ({ useCreateGoal: () => ({ mutateAsync: vi.fn(), isPending: false }), useUpdateGoal: () => ({ mutateAsync: vi.fn(), isPending: false }) }))
vi.mock('@/hooks/use-habit-queries', () => ({ useHabits: () => ({ data: { habitsById: new Map() }, isLoading: false, isError: false, refetch: vi.fn() }) }))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: { timeZone: 'UTC', weekStartDay: 0 } }) }))
vi.mock('@/hooks/use-app-toast', () => ({ useAppToast: () => ({ showError: vi.fn() }) }))
vi.mock('@/lib/posthog', async (importOriginal) => ({ ...await importOriginal<typeof import('@/lib/posthog')>(), captureGuidedFlowCompleted: vi.fn(), captureGuidedFlowEvent: vi.fn() }))
vi.mock('@/components/ui/sheet', async () => await import('@/__tests__/support/sheet-double'))
vi.mock('@/components/ui/flow-screen', () => ({ FlowScreen: ({ children }: { children: React.ReactNode }) => <div data-flow-host="" className="flex min-h-0 flex-1 flex-col">{children}</div> }))
vi.mock('@/components/habits/create-habit-modal', () => ({ CreateHabitModal: () => null }))

const WIDE = 1440
async function press(name: string) {
  await act(async () => { fireEvent.click(screen.getByRole('button', { name })) })
}
async function type(label: string, value: string) {
  await act(async () => { fireEvent.change(screen.getByLabelText(label), { target: { value } }) })
}

describe('the actions of the goal deadline question at 1440 in Chromium', () => {
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string
  registerChromeLaunchHook(beforeAll, async (launch) => { browserLaunch = launch; browser = await launch })
  beforeAll(async () => { stylesheet = await compileAppStylesheet() }, 30_000)
  afterEach(() => { cleanup(); vi.unstubAllGlobals() })
  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

  it.each([{ locale: 'pt-BR', copy: ptBR }, { locale: 'en', copy: en as typeof ptBR }])('keeps the continue of the free path at most 360 wide and in the centre of the column in $locale', async ({ locale, copy }) => {
    stubViewportMedia(WIDE)
    render(<NextIntlClientProvider locale={locale} messages={copy} timeZone="UTC"><CreateGoalSheet open onClose={vi.fn()} /></NextIntlClientProvider>)
    await type(copy.goals.form.title, 'Ler 12 livros')
    await press(copy.habits.flow.continue)
    await press(copy.goals.form.typeStandard)
    await type(copy.goals.form.targetValueQuestion, '12')
    await type(copy.goals.form.unitQuestion, 'livros')
    await press(copy.habits.flow.continue)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(copy.goals.form.deadlineQuestion)
    const markup = document.querySelector('[data-flow-host]')!.outerHTML
    const actions = await measureFlowActions(browser, stylesheet, WIDE, markup)
    expect(actions.map((action) => action.label)).toContain(copy.habits.flow.continue)
    for (const action of actions) {
      expect(action.width, `${action.label} hugs its label: ${JSON.stringify(action)}`).toBeLessThanOrEqual(360)
      expect(action.centreOffset, `${action.label} sits in the centre: ${JSON.stringify(action)}`).toBeLessThanOrEqual(1)
    }
  }, 60_000)
})

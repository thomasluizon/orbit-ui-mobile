import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { createMockHabit } from '@orbit/shared/__tests__/factories'
import { CreateGoalSheet } from '@/components/goals/create-goal-sheet'
import { EditGoalModal } from '@/components/goals/edit-goal-modal'
import { resolveWebThemeVariables } from '@/lib/theme-dom'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

const habits = vi.hoisted(() => ({ data: { habitsById: new Map<string, unknown>() }, isLoading: false, isError: false, refetch: () => Promise.resolve() }))
vi.mock('@/hooks/use-flag', () => ({ useFlag: () => true }))
vi.mock('@/hooks/use-goals', () => ({ useCreateGoal: () => ({ mutateAsync: vi.fn(), isPending: false }), useUpdateGoal: () => ({ mutateAsync: vi.fn(), isPending: false }) }))
vi.mock('@/hooks/use-habit-queries', () => ({ useHabits: () => habits }))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: { timeZone: 'UTC' } }) }))
vi.mock('@/hooks/use-app-toast', () => ({ useAppToast: () => ({ showError: vi.fn() }) }))
vi.mock('@/lib/posthog', async (importOriginal) => ({ ...await importOriginal<typeof import('@/lib/posthog')>(), captureGuidedFlowEvent: vi.fn() }))
vi.mock('@/components/ui/sheet', async () => await import('@/__tests__/support/sheet-double'))
vi.mock('@/components/ui/flow-screen', () => ({ FlowScreen: ({ children }: { children: React.ReactNode }) => <div className="flex min-h-0 flex-1 flex-col">{children}</div> }))

type Locale = 'en' | 'pt-BR'
const STEPS = ['what', 'track', 'amount', 'deadline', 'habits', 'summary', 'edit summary'] as const
const HEIGHT = 915

async function reach(step: (typeof STEPS)[number], locale: Locale) {
  const copy = locale === 'en' ? en : ptBR
  const press = async (name: string) => { await act(async () => { fireEvent.click(screen.getByRole('button', { name })) }) }
  const type = async (label: string, value: string) => { await act(async () => { fireEvent.change(screen.getByLabelText(label), { target: { value } }) }) }
  if (step === 'what') return
  await type(copy.goals.form.title, 'Read 12 books')
  await press(copy.habits.flow.continue)
  if (step === 'track') return
  await press(copy.goals.form.typeStandard)
  if (step === 'amount') return
  await type(copy.goals.form.targetValueQuestion, '12')
  await type(copy.goals.form.unitQuestion, 'books')
  await press(copy.habits.flow.continue)
  if (step === 'deadline') return
  await press(copy.goals.flow.deadline.yearEnd)
  if (step === 'habits') return
  await press(copy.habits.flow.continue)
}

const cases = ([320, 360, 384, 412] as const).flatMap((width) => (['en', 'pt-BR'] as const).flatMap((locale) => STEPS.map((step) => ({ width, locale, step }))))

describe('guided goal flow block centring in Chromium', () => {
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string
  registerChromeLaunchHook(beforeAll, async (launch) => { browserLaunch = launch; browser = await launch })
  beforeAll(async () => {
    const source = resolve('app/globals.css')
    stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
    for (const index of [1, 2, 3]) habits.data.habitsById.set(`h${index}`, createMockHabit({ id: `h${index}`, title: `Habit ${index}` }))
  })
  afterEach(cleanup)
  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

  it.each(cases)('centres the $step block between the header and the primary action at $width px in $locale', async ({ width, locale, step }) => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('prefers-reduced-motion') || width >= Number(query.match(/min-width: (\d+)px/)?.[1]),
      addEventListener: vi.fn(), removeEventListener: vi.fn(),
    }))
    const element = step === 'edit summary'
      ? <EditGoalModal open onOpenChange={vi.fn()} goal={{ id: 'g1', title: 'Run 100km', targetValue: 100, unit: 'km', deadline: '2026-12-31', type: 'Standard' }} />
      : <CreateGoalSheet open onClose={vi.fn()} />
    const view = render(<NextIntlClientProvider locale={locale} messages={locale === 'en' ? en : ptBR} timeZone="UTC">{element}</NextIntlClientProvider>)
    if (step !== 'edit summary') await reach(step, locale)
    const page = await browser.newPage({ reducedMotion: 'reduce', viewport: { width, height: HEIGHT } })
    try {
      const theme = Object.entries(resolveWebThemeVariables('orange', 'dark')).map(([key, value]) => `${key}:${value}`).join(';')
      await page.setContent(`<!DOCTYPE html><html class="dark" style="${theme}"><style>${stylesheet}</style><body><div class="flex h-dvh flex-col">${view.container.innerHTML}</div></body></html>`)
      const geometry = await page.evaluate(() => {
        const free = document.querySelector('[data-question-flow] main')!.getBoundingClientRect()
        const block = document.querySelector('[data-question-flow] main > [role="presentation"]')!.getBoundingClientRect()
        return { free: { top: free.top, bottom: free.bottom }, block: { top: block.top, bottom: block.bottom } }
      })
      if (geometry.block.bottom - geometry.block.top >= geometry.free.bottom - geometry.free.top) {
        expect(geometry.block.top, JSON.stringify(geometry)).toBeGreaterThanOrEqual(geometry.free.top)
        return
      }
      const freeCentre = (geometry.free.top + geometry.free.bottom) / 2
      const blockCentre = (geometry.block.top + geometry.block.bottom) / 2
      expect(Math.abs(blockCentre - freeCentre), JSON.stringify(geometry)).toBeLessThanOrEqual(1)
    } finally { await page.close(); view.unmount(); vi.unstubAllGlobals() }
  })
})

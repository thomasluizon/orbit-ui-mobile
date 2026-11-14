import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { createMockGoal } from '@orbit/shared/__tests__/factories'
import type { FlowStepView } from '@orbit/shared/contracts/flow'
import type { ChecklistTemplate } from '@orbit/shared/types/checklist-template'
import type { Goal } from '@orbit/shared/types/goal'
import { QuestionFlow } from '@/components/ui/question-flow'
import { useChecklistStepView } from '@/components/habits/flow-steps/checklist-step'
import { useGoalLinkStepView } from '@/components/habits/flow-steps/goal-link-step'
import { resolveWebThemeVariables } from '@/lib/theme-dom'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

const state = vi.hoisted(() => ({ locale: 'pt-BR' as 'en' | 'pt-BR', templates: [] as ChecklistTemplate[], goals: [] as Goal[] }))

vi.mock('next-intl', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next-intl')>()
  return { ...actual, useLocale: () => state.locale, useTranslations: () => actual.createTranslator({ locale: state.locale, messages: state.locale === 'en' ? en : ptBR }) }
})
vi.mock('@/lib/posthog', () => ({ captureGuidedFlowEvent: vi.fn() }))
vi.mock('@/hooks/use-checklist-templates', () => ({
  useChecklistTemplates: () => ({ data: state.templates, isLoading: false }),
  useCreateChecklistTemplate: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteChecklistTemplate: () => ({ mutate: vi.fn() }),
}))
vi.mock('@/components/habits/goal-linking-field', () => ({ useLinkableGoals: () => ({ data: state.goals }) }))
vi.mock('@/components/goals/create-goal-sheet', () => ({ CreateGoalSheet: () => null }))

const HEIGHT = 780
const noop = () => {}

function StepFlow({ view, stepKey }: Readonly<{ view: FlowStepView; stepKey: string }>) {
  return <div style={{ height: HEIGHT, display: 'flex', flexDirection: 'column' }}>
    <QuestionFlow flow="habit_create" stepKey={view.stepKey ?? stepKey} question={view.question} line={view.line} options={view.options}
      primary={view.primary} position={5} total={5} progressLabel="Passo 5 de 5" backLabel="Voltar" closeLabel="Fechar" direction={1}
      onBack={noop} onClose={noop}>{view.free}</QuestionFlow>
  </div>
}

function ChecklistStep() {
  return <StepFlow stepKey="optional:checklist" view={useChecklistStepView({ items: [], onItemsChange: noop, onContinue: noop })} />
}

function GoalStep() {
  return <StepFlow stepKey="optional:goals" view={useGoalLinkStepView({ habitTitle: 'Ler', selectedGoalIds: [], atGoalLimit: false, onToggleGoal: noop, onContinue: noop })} />
}

const steps = { checklist: ChecklistStep, goals: GoalStep }
const cases = (['pt-BR', 'en'] as const).flatMap((locale) => [320, 360, 384, 412].flatMap((width) =>
  (Object.keys(steps) as (keyof typeof steps)[]).map((step) => ({ locale, width, step }))))

describe('checklist and goal steps centring in Chromium', () => {
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string
  registerChromeLaunchHook(beforeAll, async (launch) => { browserLaunch = launch; browser = await launch })
  beforeAll(async () => {
    const source = resolve('app/globals.css')
    stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
  })
  afterEach(cleanup)
  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

  it.each(cases)('centres the $step block between the header and the primary action at $width px in $locale', async ({ locale, width, step }) => {
    state.locale = locale
    state.templates = []
    state.goals = [createMockGoal({ id: 'g1', title: 'Ler 12 livros' }), createMockGoal({ id: 'g2', title: 'Correr 100 km' })]
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce') || width >= Number(query.match(/min-width: (\d+)px/)?.[1]), addEventListener: vi.fn(), removeEventListener: vi.fn() }))
    const Step = steps[step]
    const view = render(<Step />)
    const page = await browser.newPage({ reducedMotion: 'reduce', viewport: { width, height: HEIGHT } })
    try {
      const theme = Object.entries(resolveWebThemeVariables('orange', 'dark')).map(([key, value]) => `${key}:${value}`).join(';')
      await page.setContent(`<!DOCTYPE html><html class="dark" style="${theme}"><style>${stylesheet}</style><body style="margin:0">${view.container.innerHTML}</body></html>`)
      const geometry = await page.evaluate(() => {
        const free = document.querySelector('[data-question-flow] main')!.getBoundingClientRect()
        const block = document.querySelector('[data-question-flow] main > [role="presentation"]')!.getBoundingClientRect()
        const question = document.querySelector('[data-question-flow] h1')!
        const lineHeight = Number.parseFloat(getComputedStyle(question).lineHeight)
        return { free: { top: free.top, bottom: free.bottom }, block: { top: block.top, bottom: block.bottom }, questionLines: Math.round(question.getBoundingClientRect().height / lineHeight) }
      })
      const freeCentre = (geometry.free.top + geometry.free.bottom) / 2
      const blockCentre = (geometry.block.top + geometry.block.bottom) / 2
      expect(geometry.block.bottom - geometry.block.top, JSON.stringify(geometry)).toBeLessThan(geometry.free.bottom - geometry.free.top)
      expect(Math.abs(blockCentre - freeCentre), JSON.stringify(geometry)).toBeLessThanOrEqual(1)
      expect(geometry.questionLines, JSON.stringify(geometry)).toBeLessThanOrEqual(2)
    } finally { await page.close(); view.unmount(); vi.unstubAllGlobals() }
  })
})

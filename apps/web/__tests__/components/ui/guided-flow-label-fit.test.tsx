import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { OptionCard } from '@/components/ui/option-card'
import { QuestionFlow } from '@/components/ui/question-flow'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'
import { FLOW_LOCALES, FLOW_WIDTHS, centreOffset, compileAppStylesheet, measureFlowMarkup, stubViewportMedia } from '@/__tests__/support/flow-layout'

vi.mock('@/lib/posthog', () => ({ captureGuidedFlowEvent: vi.fn() }))

type Copy = typeof ptBR
interface Step { question: string; line?: string; options?: string[] }

/** Every question of the habit, goal and onboarding flows, with each Orbit line under Orbit and the quick options its `OptionCard` call sites show. */
function steps(copy: Copy): Record<string, Step> {
  const flow = copy.habits.flow
  const goal = copy.goals
  const onboarding = copy.onboarding.flow
  return {
    what: { question: flow.what.question, line: flow.what.lineEmpty },
    when: { question: flow.when.question, line: flow.when.line, options: [flow.when.today, flow.when.tomorrow, flow.when.everyDay, flow.when.noDate] },
    time: { question: flow.time.question, line: flow.time.line, options: ['8:00', '14:00', '20:00', flow.time.none] },
    reminder: { question: flow.reminder.question.replace('{time}', '20:00'), line: flow.reminder.line, options: [flow.reminder.yes, flow.reminder.no] },
    confirm: { question: flow.confirm.question, line: flow.confirm.line },
    type: { question: flow.type.question, line: flow.type.line },
    repeat: { question: flow.repeat.question, line: flow.repeat.line, options: [flow.repeat.everyN, flow.repeat.timesIn] },
    duration: { question: flow.duration.question, options: [flow.duration.none] },
    'reminder kind': { question: flow.reminderKind.question },
    more: { question: flow.more },
    description: { question: flow.optional.description },
    checklist: { question: flow.optional.checklist, line: flow.checklist.line, options: [flow.optional.no, flow.checklist.useTemplate] },
    templates: { question: flow.templates.question, line: flow.templates.line },
    'template name': { question: flow.templates.saveQuestion, line: flow.templates.saveLine },
    'sub-habits': { question: flow.optional.subHabits },
    avoid: { question: flow.optional.avoid, options: [flow.optional.yes, flow.optional.no] },
    'slip alert': { question: flow.optional.slipAlert, options: [flow.optional.yes, flow.optional.no] },
    tags: { question: flow.optional.tags, line: flow.tags.lineIntro, options: [flow.tags.none] },
    goals: { question: flow.optional.goals, line: flow.goals.line, options: [copy.habits.form.createGoal] },
    'end date': { question: flow.optional.endDate, options: [flow.optional.none] },
    parent: { question: flow.optional.parent },
    'goal title': { question: goal.form.title, line: goal.flow.what.line },
    'goal tracking': { question: goal.form.typeQuestion, line: goal.flow.track.line, options: [goal.form.typeStandard, goal.form.typeStreak] },
    'goal deadline': { question: goal.form.deadlineQuestion, line: goal.flow.deadline.line, options: [goal.flow.deadline.none, goal.flow.deadline.monthEnd, goal.flow.deadline.yearEnd] },
    'goal habits': { question: goal.flow.habits.question },
    'what typed': { question: flow.what.question, line: flow.what.lineTyped },
    'what offline': { question: flow.what.question, line: flow.orbit.offline },
    'from conversation': { question: flow.confirm.question, line: flow.orbit.fromConversation },
    'tag has': { question: flow.optional.tags, line: flow.tags.lineHas.replace('{tag}', 'Saúde').replace('{items}', 'Beber água, Caminhar, Ler'), options: [flow.tags.none] },
    'tag empty': { question: flow.optional.tags, line: flow.tags.lineEmpty.replace('{tag}', 'Saúde'), options: [flow.tags.none] },
    'templates empty': { question: flow.templates.question, line: flow.templates.lineEmpty },
    'goals empty': { question: flow.optional.goals, line: flow.goals.lineEmpty, options: [copy.habits.form.createGoal] },
    'goal amount': { question: goal.form.targetValueQuestion, line: goal.flow.amount.line },
    'goal streak': { question: goal.form.targetValueQuestion, line: goal.flow.amount.streakLine },
    'code locked': { question: copy.auth.verificationCode, line: copy.auth.line.codeLocked.replace('{time}', '14:59') },
    'onboarding mode': { question: flow.repeat.question, options: [onboarding.guided.mode.fixed, onboarding.guided.mode.flexible, onboarding.guided.mode.interval, onboarding.guided.mode.oneTime] },
    'onboarding time': { question: onboarding.guided.time.question, line: onboarding.guided.time.line, options: ['8:00', '14:00', '20:00', onboarding.guided.time.none] },
    'onboarding remind': { question: onboarding.guided.remind.question.replace('{time}', '20:00'), line: onboarding.guided.remind.line, options: [onboarding.guided.remind.allow, onboarding.remind.deny] },
  }
}

const NAMES = Object.keys(steps(ptBR))
const cases = FLOW_WIDTHS.flatMap((width) => FLOW_LOCALES.flatMap((locale) => NAMES.map((name) => ({ width, locale, name }))))

describe('guided flow label fit in Chromium', () => {
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string
  registerChromeLaunchHook(beforeAll, async (launch) => { browserLaunch = launch; browser = await launch })
  beforeAll(async () => { stylesheet = await compileAppStylesheet() }, 30_000)
  afterEach(() => { cleanup(); vi.unstubAllGlobals() })
  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

  it.each(cases)('holds each label of the $name step on one line, and its question and its Orbit line in two lines at most, at $width px in $locale', async ({ width, locale, name }) => {
    stubViewportMedia(width)
    const copy = locale === 'en' ? en as Copy : ptBR
    const step = steps(copy)[name]!
    const view = render(
      <QuestionFlow flow="habit_create" stepKey={name} direction={1} question={step.question} line={step.line} position={1} total={3}
        progressLabel={copy.habits.flow.progress.replace('{position}', '1').replace('{total}', '3')} backLabel={copy.habits.flow.back} closeLabel={copy.habits.flow.close}
        onBack={() => {}} onClose={() => {}} primary={{ label: copy.habits.flow.continue, onPress: () => {} }}
        options={step.options ? step.options.map((label) => <OptionCard key={label} label={label} onSelect={() => {}} />) : undefined} />,
    )
    const markup = view.container.innerHTML
    view.unmount()
    const layout = await measureFlowMarkup(browser, stylesheet, width, markup)
    expect(layout.questionLines, step.question).toBeGreaterThanOrEqual(1)
    expect(layout.questionLines, step.question).toBeLessThanOrEqual(2)
    if (step.line) expect(layout.orbitLineLines, step.line).toBeLessThanOrEqual(2)
    expect(layout.labels.map((label) => label.label)).toEqual([...(step.options ?? []), copy.habits.flow.continue])
    for (const label of layout.labels) expect(label.lines, label.label).toBe(1)
    expect(centreOffset(layout), JSON.stringify(layout)).toBeLessThanOrEqual(1)
  }, 60_000)
})

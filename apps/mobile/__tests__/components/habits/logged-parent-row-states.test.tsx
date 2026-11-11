import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nextProvider } from 'react-i18next'
import type { ReactTestInstance } from 'react-test-renderer'
import { createMockHabit } from '@orbit/shared/__tests__/factories'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
import { i18n } from '@/lib/i18n'
import { createTokensV2 } from '@/lib/theme'
import { HabitRow, type HabitRowProps } from '@/components/habits/habit-row'
import { __resetTestHostConfig, __setWindowDimensions } from '@/test-mocks/react-native'

vi.unmock('react-i18next')

const TestRenderer = require('react-test-renderer')

vi.mock('@/hooks/use-time-format', () => ({ useTimeFormat: () => ({ displayTime: (value: string) => value, displayReminderClock: () => '04:00' }) }))
vi.mock('@/lib/use-app-theme', () => ({ useAppTheme: () => ({ currentScheme: 'purple', currentTheme: 'dark' }) }))
vi.mock('@/lib/motion', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/motion')>(),
  getPrefersReducedMotion: () => Promise.resolve(true),
  usePrefersReducedMotion: () => true,
}))

const TODAY = '2026-09-12'
const tokens = createTokensV2('purple', 'dark')

function loggedParent(overrides: Partial<NormalizedHabit> = {}): NormalizedHabit {
  return createMockHabit({ id: 'parent', title: 'Parent', hasSubHabits: true, isLoggedInRange: true, dueDate: '2026-09-13',
    frequencyUnit: 'Day', frequencyQuantity: 1, scheduledDates: [], ...overrides })
}

function renderRow(habit: NormalizedHabit, props: Partial<HabitRowProps> = {}): ReactTestInstance {
  let tree: ReturnType<typeof TestRenderer.create>
  TestRenderer.act(() => {
    tree = TestRenderer.create(<I18nextProvider i18n={i18n}>
      <HabitRow habit={habit} today={TODAY} selectedDate={new Date(`${TODAY}T12:00:00`)} hasChildren={habit.hasSubHabits}
        childrenDone={0} childrenTotal={habit.hasSubHabits ? 2 : 0} {...props} />
    </I18nextProvider>)
  })
  return tree!.root
}

function texts(node: ReactTestInstance): string[] {
  return node.findAll((candidate) => String(candidate.type) === 'Text')
    .map((text) => [text.props.children].flat().filter((part) => typeof part === 'string').join(''))
}

function visibleMeta(root: ReactTestInstance): string[] {
  return root.findAll((node) => node.props.testID === 'habit-row-meta' && typeof node.type === 'string').flatMap(texts).filter((text) => text !== '·')
}

function titleColor(root: ReactTestInstance, title: string): unknown {
  const text = root.findAll((node) => String(node.type) === 'Text' && node.props.children === title)[0]!
  return [text.props.style].flat(Infinity).reduce((color: unknown, style) => (style as { color?: unknown } | null)?.color ?? color, undefined)
}

function checkPaint(root: ReactTestInstance) {
  const check = root.findAll((node) => node.props.testID === 'habit-check' && typeof node.type === 'string')[0]!
  const style = Object.assign({}, ...[check.props.style].flat(Infinity)) as { backgroundColor?: string }
  return { fill: style.backgroundColor, sweep: [...new Set(check.findAll((node) => node.props.strokeDasharray !== undefined).map((node) => node.props.stroke))] }
}

function bodyHint(root: ReactTestInstance): string | undefined {
  return root.findAll((node) => node.props.delayLongPress === 500 && typeof node.type === 'string')[0]!.props.accessibilityHint as string | undefined
}

beforeEach(async () => { await i18n.changeLanguage('en') })
afterEach(() => { __resetTestHostConfig() })

describe('logged parent row states', () => {
  it.each([['en', 'due tomorrow'], ['pt-BR', 'volta amanhã']])('shows the %s next due label last on a logged parent', async (language, label) => {
    await i18n.changeLanguage(language)
    const root = renderRow(loggedParent())
    expect({ meta: visibleMeta(root).at(-1), title: titleColor(root, 'Parent'), check: checkPaint(root).fill, hint: bodyHint(root) })
      .toEqual({ meta: label, title: tokens.fg3, check: tokens.fg1, hint: label })
  })

  it('keeps the dim and the label in selection mode', () => {
    const root = renderRow(loggedParent(), { isSelectMode: true, structuralColumn: true })
    expect({ meta: visibleMeta(root).at(-1), title: titleColor(root, 'Parent') }).toEqual({ meta: 'due tomorrow', title: tokens.fg3 })
  })

  it('keeps the title colour and the hidden label of a logged row with no sub-habits', () => {
    const root = renderRow(loggedParent({ title: 'Leaf', hasSubHabits: false }))
    expect({ meta: visibleMeta(root), title: titleColor(root, 'Leaf'), hint: bodyHint(root) })
      .toEqual({ meta: ['Habit'], title: tokens.fg1, hint: 'due tomorrow' })
  })

  it('keeps the bad check of a logged bad parent', () => {
    const root = renderRow(loggedParent({ isBadHabit: true }), { childrenDone: 1 })
    expect(checkPaint(root)).toEqual({ fill: 'transparent', sweep: [tokens.statusBad] })
  })

  it('keeps the ratio check and the normal title of a parent with every sub-habit done and no log of its own', () => {
    const root = renderRow(loggedParent({ isLoggedInRange: false, dueDate: TODAY, scheduledDates: [TODAY] }), { childrenDone: 2 })
    expect({ meta: visibleMeta(root), title: titleColor(root, 'Parent') }).toEqual({ meta: ['Habit', '2 of 2'], title: tokens.fg1 })
  })

  it('dims a completed one-time parent task and shows no next due label', () => {
    const root = renderRow(loggedParent({ isLoggedInRange: false, isCompleted: true, frequencyUnit: null, frequencyQuantity: null }))
    expect({ meta: visibleMeta(root), title: titleColor(root, 'Parent'), check: checkPaint(root).fill })
      .toEqual({ meta: ['Task', '0 of 2'], title: tokens.fg3, check: tokens.fg1 })
  })

  it('dims a logged parent on a past date and shows no next due label', () => {
    const root = renderRow(loggedParent({ dueDate: TODAY }), { selectedDate: new Date('2026-09-11T12:00:00') })
    expect({ meta: visibleMeta(root).includes('due tomorrow'), title: titleColor(root, 'Parent'), check: checkPaint(root).fill })
      .toEqual({ meta: false, title: tokens.fg3, check: tokens.fg1 })
  })

  it('carries the next due label in the supporting footer at large text', () => {
    __setWindowDimensions({ width: 412, height: 915, scale: 2.625, fontScale: 2 })
    const root = renderRow(loggedParent())
    const strips = root.findAll((node) => node.props.testID === 'habit-row-meta' && typeof node.type === 'string')
    expect({ strips: strips.length, last: texts(strips[0]!).filter((text) => text !== '·').at(-1) }).toEqual({ strips: 1, last: 'due tomorrow' })
  })
})

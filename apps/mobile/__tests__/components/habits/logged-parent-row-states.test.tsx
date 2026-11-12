import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nextProvider } from 'react-i18next'
import type { ReactTestInstance } from 'react-test-renderer'
import { createMockHabit } from '@orbit/shared/__tests__/factories'
import { LOGGED_PARENT_TODAY, loggedParentRowCases } from '@orbit/shared/test-support/logged-parent-row-cases'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
import { i18n } from '@/lib/i18n'
import { createTokensV2 } from '@/lib/theme'
import { HabitRow, type HabitRowProps } from '@/components/habits/habit-row'
import { __resetTestHostConfig, __setWindowDimensions } from '@/test-mocks/react-native'
import { measureInteractionFills } from '@/__tests__/support/interaction-fill-geometry'

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

  it.each([['en', 'due tomorrow'], ['pt-BR', 'amanhã']])('gives a %s screen reader first-occurrence words for a row due tomorrow that has not been logged', async (language, label) => {
    await i18n.changeLanguage(language)
    const openParent = renderRow(loggedParent({ isLoggedInRange: false }))
    const openTask = renderRow(createMockHabit({ id: 'dentist', title: 'Dentist', dueDate: '2026-09-13', frequencyUnit: null, frequencyQuantity: null, scheduledDates: [] }))
    expect({
      parentHint: bodyHint(openParent), parentVisible: visibleMeta(openParent).includes(label),
      taskHint: bodyHint(openTask), taskVisible: visibleMeta(openTask).includes(label),
    }).toEqual({ parentHint: label, parentVisible: false, taskHint: label, taskVisible: false })
  })
})

describe('logged parent row decision', () => {
  it.each(loggedParentRowCases)('dims $name and shows its next due label as the shared rule decides', ({ habit, hasChildren, depth, selectedDate, loggedParent: dimmed, nextDueVisible }) => {
    const root = renderRow(habit, { hasChildren, depth, childrenTotal: hasChildren ? 2 : 0, selectedDate: new Date(`${selectedDate}T12:00:00`), today: LOGGED_PARENT_TODAY })
    expect({ dimmed: titleColor(root, 'Parent') === tokens.fg3, nextDueVisible: visibleMeta(root).at(-1) === 'due tomorrow' })
      .toEqual({ dimmed, nextDueVisible })
  })
})

describe('logged parent row metadata fit', () => {
  it.each([320, 360, 384, 412].flatMap((width) => ['en', 'pt-BR'].flatMap((language) => [0, 1].map((depth) => ({ width, language, depth })))))(
    'keeps the next due token whole on one metadata line at $width dp in $language, depth=$depth', async ({ width, language, depth }) => {
      await i18n.changeLanguage(language)
      __setWindowDimensions({ width, height: 915, scale: 1, fontScale: 1 })
      const rowWidth = width - 32
      let tree: ReturnType<typeof TestRenderer.create>
      TestRenderer.act(() => {
        tree = TestRenderer.create(<I18nextProvider i18n={i18n}>
          <HabitRow habit={loggedParent()} today={TODAY} selectedDate={new Date(`${TODAY}T12:00:00`)} depth={depth} structuralColumn hasChildren
            childrenDone={0} childrenTotal={2} actions={{ onEdit: vi.fn(), onToggleExpand: vi.fn(), onLog: vi.fn(), onUnlog: vi.fn() }} />
        </I18nextProvider>)
      })
      const layoutEvent = (layoutWidth: number) => ({ nativeEvent: { layout: { x: 0, y: 0, width: layoutWidth, height: 52 } } })
      for (let pass = 0; pass < 3; pass += 1) {
        const measured = measureInteractionFills(tree!.toJSON(), rowWidth, false)
        const content = measured.find((part) => part.host.props.testID === 'habit-row-title-block')!
        const tokenWidths = measured.filter((part) => part.host.props.testID === 'habit-row-meta-token').map((part) => part.width)
        TestRenderer.act(() => {
          tree!.root.findAll((node: ReactTestInstance) => typeof node.props.onLayout === 'function' && String(node.type) === 'View')[0]!.props.onLayout(layoutEvent(rowWidth))
          tree!.root.findByProps({ testID: 'habit-row-title-block' }).props.onLayout(layoutEvent(content.width))
          tree!.root.findAll((node: ReactTestInstance) => node.props.testID === 'habit-row-meta-token' && String(node.type) === 'View')
            .forEach((node: ReactTestInstance, index: number) => (node.props.onLayout as (event: ReturnType<typeof layoutEvent>) => void)(layoutEvent(tokenWidths[index]!)))
        })
      }
      const geometry = measureInteractionFills(tree!.toJSON(), rowWidth, false)
      const row = geometry.find((part) => part.host.props.testID === 'habit-row')!
      const tokens = geometry.filter((part) => part.host.props.testID === 'habit-row-meta-token')
      const label = i18n.t('habits.schedule.nextDueTomorrow')
      /** A nested parent at 320 dp is already on the supporting line, which may hold only two tokens; the whole label then starts the next line. */
      const maximumLines = width === 320 && depth === 1 ? 2 : 1
      const lines = new Set(tokens.map((token) => Math.round(token.top))).size
      expect({
        last: texts(tree!.root.findAll((node: ReactTestInstance) => node.props.testID === 'habit-row-meta' && typeof node.type === 'string')[0]).filter((text) => text !== '·').at(-1),
        fits: lines <= maximumLines,
        clipped: tokens.filter((token) => token.left < row.left || token.right > row.right).length,
      }).toEqual({ last: label, fits: true, clipped: 0 })
      TestRenderer.act(() => tree!.unmount())
    },
  )
})

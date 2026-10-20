import { afterEach, describe, expect, it, vi } from 'vitest'
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native'
import { createMockHabit } from '@orbit/shared/__tests__/factories'
import { HabitRow } from '@/components/habits/habit-row'
import { createTokensV2 } from '@/lib/theme'
import { __resetTestHostConfig, __setWindowDimensions } from '@/test-mocks/react-native'
import { measureInteractionFills } from '@/__tests__/support/interaction-fill-geometry'

const TestRenderer = require('react-test-renderer')
const theme = vi.hoisted((): { mode: 'light' | 'dark' } => ({ mode: 'dark' }))
vi.mock('@/lib/use-app-theme', () => ({ useAppTheme: () => ({ currentScheme: 'orange', currentTheme: theme.mode }) }))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }) }))
vi.mock('@/hooks/use-time-format', () => ({ useTimeFormat: () => ({ displayTime: (value: string) => value }) }))
vi.mock('@/lib/motion', () => ({ usePrefersReducedMotion: () => true }))

afterEach(() => { __resetTestHostConfig(); theme.mode = 'dark' })

function assertParentProgressLabel(root: import('react-test-renderer').ReactTestInstance, selecting: boolean, done: number, total: number) {
  if (total === 0) return
  const label = `${done}/${total}`
  const role = selecting ? 'image' : 'button'
  const indicators = root.findAll((node) => node.props.accessibilityRole === role && String(node.props.accessibilityLabel).includes(label))
  expect(indicators.length).toBeGreaterThan(0)
}

describe('habit row standard on Android', () => {
  it.each((['light', 'dark'] as const).flatMap((mode) => [320, 412, 1352].flatMap((width) =>
    [1, 2].flatMap((fontScale) => [0, 1].map((depth) => ({ mode, width, fontScale, depth: depth as 0 | 1 }))),
  )))('keeps bordered rows and checks in $mode at $width with $fontScale text and depth $depth', ({ mode, width, fontScale, depth }) => {
    theme.mode = mode
    __setWindowDimensions({ width, height: 892, scale: 1, fontScale })
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = TestRenderer.create(<HabitRow habit={createMockHabit({ title: 'Read' })}
      depth={depth} panelEnd={false} />) })
    const tokens = createTokensV2('orange', mode)
    const row = tree!.root.findByProps({ testID: 'habit-row' })
    const geometry = measureInteractionFills(tree!.toJSON(), width, false, fontScale)
    const well = geometry.find((part) => part.style.borderRadius === 12 && part.style.width === (depth === 1 ? 32 : 46))!
    expect(well.left).toBe(depth === 1 ? 24 : 8)
    expect(StyleSheet.flatten(row.props.style)).toMatchObject({ borderRadius: 20, backgroundColor: tokens.bgCard })
    expect(StyleSheet.flatten(row.props.style).borderWidth ?? 0).toBe(0)
    const outline = tree!.root.findByProps({ testID: 'habit-row-outline' })
    expect(StyleSheet.flatten(outline.props.style)).toMatchObject({ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, borderRadius: 20, borderWidth: 1, borderColor: tokens.hairline })
    expect(outline.props).toMatchObject({ pointerEvents: 'none', accessible: false, importantForAccessibility: 'no-hide-descendants' })
    const spacing = tree!.root.findAllByType('View').filter((node: { props: { style: StyleProp<ViewStyle> } }) => StyleSheet.flatten<ViewStyle | undefined>(node.props.style)?.paddingBottom === 4)
    expect(spacing).toHaveLength(1)
    const check = tree!.root.findByProps({ testID: 'habit-check' })
    expect(StyleSheet.flatten(check.props.style)).toMatchObject({ width: 28, height: 28, borderRadius: 12, borderWidth: 1, borderColor: tokens.statusEmpty })
    const toggle = tree!.root.findAllByType('Pressable').find((node: { props: Record<string, unknown> }) => node.props.accessibilityLabel === 'habits.statusDot.empty, habits.logHabit: Read')!
    expect(StyleSheet.flatten(toggle.props.style({ pressed: false }))).toMatchObject({ width: 48, minHeight: 48, borderRadius: 22 })
    TestRenderer.act(() => tree.unmount())
  })

  it.each(['light', 'dark'] as const)('retains status colours, progress and one focus indicator in %s', (mode) => {
    theme.mode = mode
    const tokens = createTokensV2('orange', mode)
    const cases = [
      { flags: {}, border: tokens.statusEmpty, fill: 'transparent', done: 0, total: 0 },
      { flags: { isCompleted: true }, border: tokens.fg1, fill: tokens.fg1, done: 0, total: 0 },
      { flags: { isOverdue: true }, border: tokens.statusOverdue, fill: 'transparent', done: 0, total: 0 },
      { flags: { isBadHabit: true }, border: tokens.statusBad, fill: 'transparent', done: 0, total: 0 },
      { flags: {}, border: tokens.trackEmpty, fill: 'transparent', done: 0, total: 2 },
      { flags: {}, border: tokens.trackEmpty, fill: 'transparent', done: 1, total: 3 },
      { flags: {}, border: tokens.trackEmpty, fill: tokens.fg1, done: 3, total: 3 },
    ]
    for (const scenario of cases) {
      for (const isSelectMode of [false, true]) {
        let tree: ReturnType<typeof TestRenderer.create>
        TestRenderer.act(() => { tree = TestRenderer.create(<HabitRow habit={createMockHabit({ title: 'Read', ...scenario.flags })}
          today="2025-01-01" selectedDate={new Date(2025, 0, 1)}
          hasChildren={scenario.total > 0} childrenDone={scenario.done} childrenTotal={scenario.total} isSelectMode={isSelectMode} />) })
        const check = tree!.root.findByProps({ testID: 'habit-check' })
        assertParentProgressLabel(tree!.root, isSelectMode, scenario.done, scenario.total)
        expect(StyleSheet.flatten(check.props.style)).toMatchObject({ width: 28, height: 28, borderRadius: 12, borderColor: scenario.border, backgroundColor: scenario.fill })
        const paths = tree!.root.findAllByType('Path').filter((node: { props: Record<string, unknown> }) => node.props.strokeDasharray)
        expect(paths).toHaveLength(scenario.done === 1 ? 1 : 0)
        if (paths.length) expect(paths[0].props.stroke).toBe(tokens.primary)
        if (!isSelectMode) {
          const toggle = tree!.root.findAllByType('Pressable').find((node: { props: Record<string, unknown> }) => String(node.props.accessibilityLabel).includes(': Read'))!
          expect(toggle.props.disabled).not.toBe(true)
          const target = {}
          TestRenderer.act(() => toggle.props.onFocus({ target, currentTarget: target }))
          const indicators = tree!.root.findAllByType('View').filter((node: { props: { style: StyleProp<ViewStyle> } }) => StyleSheet.flatten<ViewStyle | undefined>(node.props.style)?.outlineWidth === 2)
          expect(indicators).toHaveLength(1)
          expect(StyleSheet.flatten(indicators[0].props.style)).toMatchObject({ borderRadius: 22, outlineOffset: -10 })
        }
        TestRenderer.act(() => tree.unmount())
      }
    }
  })
})


it.each([320, 412, 1352].flatMap((width) => [1, 2].flatMap((fontScale) => [0, 1].flatMap((depth) =>
  [false, true].flatMap((parent) => [false, true].map((described) => ({ width, fontScale, depth: depth as 0 | 1, parent, described }))),
))))(
  'measures native feedback at $width/$fontScale, depth=$depth parent=$parent description=$described', ({ width, fontScale, depth, parent, described }) => {
    __setWindowDimensions({ width, height: 892, scale: 1, fontScale })
    const tokens = createTokensV2('orange', 'dark')
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = TestRenderer.create(<HabitRow habit={createMockHabit({ title: 'Read ten minutes', description: described ? 'Read two pages before breakfast. '.repeat(12) : null, dueTime: '08:00' })}
      today="2025-01-01" selectedDate={new Date(2025, 0, 1)} depth={depth} hasChildren={parent} childrenDone={parent ? 1 : 0} childrenTotal={parent ? 3 : 0}
      structuralColumn actions={{ onEdit: vi.fn(), onDetail: vi.fn() }} />) })
    const body = tree!.root.findAllByType('Pressable').find((node: { props: { delayLongPress?: number } }) => node.props.delayLongPress === 500)!
    const measure = () => measureInteractionFills(tree!.toJSON(), width, false, fontScale)
    const geometry = measure()
    const row = geometry.find((part) => part.host.props.testID === 'habit-row')!
    const check = geometry.find((part) => part.host.props.testID === 'habit-check')!
    const target = geometry.find((part) => part.host.type === 'Pressable' && part.host.props.accessibilityLabel?.includes('habits.logHabit:'))!
    expect(Math.abs((check.left + check.right) / 2 - (target.left + target.right) / 2)).toBeLessThanOrEqual(1)
    expect(Math.abs((check.top + check.bottom) / 2 - (target.top + target.bottom) / 2)).toBeLessThanOrEqual(1)
    if (fontScale === 1) expect(Math.abs((target.top + target.bottom) / 2 - (row.top + row.bottom) / 2)).toBeLessThanOrEqual(1)
    else expect(target.top - row.top).toBe(depth ? 4 : 8)
    expect(target.width).toBe(48)
    const title = geometry.find((part) => part.host.type === 'Text' && part.host.children?.includes('Read ten minutes') && part.style.opacity !== 0)!
    expect((title.style as import('react-native').TextStyle).fontSize).toBe(depth ? 14 : 17)
    const preview = geometry.find((part) => part.host.props.testID === 'habit-row-description')
    expect(Boolean(preview)).toBe(described)
    if (preview) {
      expect((preview.style as import('react-native').TextStyle).color).toBe(tokens.fg3)
      const meta = geometry.find((part) => part.host.props.testID === 'habit-row-meta')!
      expect(preview.top - title.bottom).toBeCloseTo(4, 1)
      expect(row.bottom - meta.bottom).toBeGreaterThanOrEqual(3.99)
      expect(meta.top - preview.bottom).toBeGreaterThanOrEqual(4)
      expect(meta.left).toBe(title.left)
      expect(preview.height).toBeLessThanOrEqual(21.7 * fontScale * (fontScale > 1.3 ? 2 : 1) + 1)
      if (fontScale === 2) expect(preview.height).toBeGreaterThan(21.7 * fontScale + 1)
      expect(preview.right).toBeLessThanOrEqual(row.right - 8)
      expect(row.bottom - preview.bottom).toBeGreaterThanOrEqual(4)
    }
    function assertFeedback() {
      for (const event of ['onPressIn', 'onHoverIn']) {
        TestRenderer.act(() => body.props[event]())
        const paints = measure().filter((part) => part.style.backgroundColor === tokens.bgHover)
        expect(paints).toHaveLength(1)
        expect(paints[0]).toMatchObject({ left: row.left, right: row.right, top: row.top, bottom: row.bottom })
        expect(paints[0]!.style.borderRadius).toBe(20)
        const preview = measure().find((part) => part.host.props.testID === 'habit-row-description')
        if (preview) expect((preview.style as import('react-native').TextStyle).color).toBe(tokens.fg2)
        TestRenderer.act(() => body.props[event === 'onPressIn' ? 'onPressOut' : 'onHoverOut']())
        expect(measure().filter((part) => part.style.backgroundColor === tokens.bgHover)).toHaveLength(0)
      }
    }
    assertFeedback()
    const controls = tree!.root.findAllByType('Pressable').filter((node: { props: { onHoverIn?: unknown; delayLongPress?: number } }) => node.props.onHoverIn && node.props.delayLongPress !== 500)
    for (const control of controls) {
      TestRenderer.act(() => control.props.onHoverIn())
      const paints = measure().filter((part) => part.style.backgroundColor === tokens.bgHover)
      expect(paints).toHaveLength(1)
      expect(paints[0]!.host.type).toBe('Pressable')
      expect(paints[0]!.style.transform ?? []).not.toContainEqual({ scale: 0.96 })
      expect(StyleSheet.flatten(tree!.root.findByProps({ testID: 'habit-row' }).props.style).backgroundColor).toBe(tokens.bgCard)
      TestRenderer.act(() => control.props.onHoverOut())
      expect(measure().filter((part) => part.style.backgroundColor === tokens.bgHover)).toHaveLength(0)
    }
    TestRenderer.act(() => tree.unmount())
  },
)

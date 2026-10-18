import { afterEach, describe, expect, it, vi } from 'vitest'
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native'
import { createMockHabit } from '@orbit/shared/__tests__/factories'
import { HabitRow } from '@/components/habits/habit-row'
import { createTokensV2 } from '@/lib/theme'
import { __resetTestHostConfig, __setWindowDimensions } from '@/test-mocks/react-native'

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
  it.each((['light', 'dark'] as const).flatMap((mode) => [320, 1352].flatMap((width) =>
    [1, 2].flatMap((fontScale) => [0, 1].map((depth) => ({ mode, width, fontScale, depth: depth as 0 | 1 }))),
  )))('keeps bordered rows and checks in $mode at $width with $fontScale text and depth $depth', ({ mode, width, fontScale, depth }) => {
    theme.mode = mode
    __setWindowDimensions({ width, height: 892, scale: 1, fontScale })
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = TestRenderer.create(<HabitRow habit={createMockHabit({ title: 'Read' })}
      depth={depth} panelEnd={false} />) })
    const tokens = createTokensV2('orange', mode)
    const row = tree!.root.findByProps({ testID: 'habit-row' })
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

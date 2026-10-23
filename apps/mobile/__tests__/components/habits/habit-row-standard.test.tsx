import { afterEach, describe, expect, it, vi } from 'vitest'
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native'
import { createMockHabit } from '@orbit/shared/__tests__/factories'
import { HabitRow } from '@/components/habits/habit-row'
import { createTokensV2 } from '@/lib/theme'
import { __resetTestHostConfig, __setWindowDimensions } from '@/test-mocks/react-native'
import { measureInteractionFills } from '@/__tests__/support/interaction-fill-geometry'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'

vi.unmock('@/components/ui/icons')
const TestRenderer = require('react-test-renderer')
const theme = vi.hoisted((): { mode: 'light' | 'dark' } => ({ mode: 'dark' }))
const motion = vi.hoisted(() => ({ reduced: true }))
const rowLocale = vi.hoisted((): { value: 'en' | 'pt-BR' } => ({ value: 'en' }))
vi.mock('@/lib/use-app-theme', () => ({ useAppTheme: () => ({ currentScheme: 'orange', currentTheme: theme.mode }) }))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => {
  const messages = rowLocale.value === 'en' ? en : ptBR
  return key === 'habits.rowTypeTask' ? messages.habits.rowTypeTask : key === 'habits.form.typeTask' ? messages.habits.form.typeTask : key === 'habits.form.typeHabit' ? messages.habits.form.typeHabit : key
}, i18n: { language: rowLocale.value } }) }))
vi.mock('@/hooks/use-time-format', () => ({ useTimeFormat: () => ({ displayTime: (value: string) => value }) }))
vi.mock('@/lib/motion', () => ({ usePrefersReducedMotion: () => motion.reduced }))

afterEach(() => { __resetTestHostConfig(); theme.mode = 'dark'; rowLocale.value = 'en'; motion.reduced = true })

function assertParentProgressLabel(root: import('react-test-renderer').ReactTestInstance, selecting: boolean, done: number, total: number) {
  if (total === 0) return
  const label = `${done}/${total}`
  const role = selecting ? 'image' : 'button'
  const indicators = root.findAll((node) => node.props.accessibilityRole === role && String(node.props.accessibilityLabel).includes(label))
  expect(indicators.length).toBeGreaterThan(0)
}

function assertTypePlacement(geometry: ReturnType<typeof measureInteractionFills>, fontScale: number, depth: number, supportingMeta: boolean) {
  const row = geometry.find((part) => part.host.props.testID === 'habit-row')!
  const primary = geometry.find((part) => part.host.type === 'Pressable' && 'delayLongPress' in part.host.props && part.host.props.delayLongPress === 500)!
  const types = geometry.filter((part) => part.host.props.testID === 'habit-row-type')
  expect(types).toHaveLength(1)
  const type = types[0]!
  const title = geometry.find((part) => part.host.type === 'Text' && part.host.children?.includes('Read ten minutes') && part.style.opacity !== 0)!
  const metadata = geometry.find((part) => part.host.props.testID === 'habit-row-meta')!
  expect(type.left).toBe(title.left)
  expect(metadata.left).toBe(title.left)
  expect(type.host.props.numberOfLines).toBeUndefined()
  const typeLabel = type.host.children!.filter((child) => typeof child === 'string').join('')
  expect(String(primary.host.props.accessibilityLabel).split(typeLabel)).toHaveLength(2)
  if (!supportingMeta) {
    expect(type.ancestors).toContain(primary.slot)
    expect(primary.style.paddingRight).toBe(4)
    return
  }
  expect(primary).toMatchObject({ left: row.left, right: row.right, top: row.top, bottom: row.bottom })
  expect(type.ancestors).not.toContain(primary.slot)
  expect(metadata.ancestors).not.toContain(primary.slot)
  expect(geometry.some((part) => type.ancestors.includes(part.slot) && 'importantForAccessibility' in part.host.props && part.host.props.importantForAccessibility === 'no-hide-descendants')).toBe(true)
  const footerContent = geometry.find((part) => part.slot === metadata.ancestors.at(-1))!
  expect(footerContent.right).toBe(row.right - 8)
  expect(metadata.right).toBe(footerContent.right)
  expect(footerContent.style).toMatchObject({ flex: 1, minWidth: 0 })
  const heading = geometry.find((part) => title.ancestors.includes(part.slot) && part.style.minHeight === (depth ? 52 : 68) && part.style.paddingTop === (depth ? 4 : 8))!
  const description = geometry.find((part) => part.host.props.testID === 'habit-row-description')
  expect(type.top - heading.bottom).toBeCloseTo(description ? 0 : 4, 1)
  expect(type.top - (description ?? title).bottom).toBeGreaterThanOrEqual(4)
  expect(type.top).toBeCloseTo(metadata.top, 1)
  expect(type.bottom).toBeLessThanOrEqual(metadata.bottom)
  expect(row.bottom - metadata.bottom).toBeCloseTo(8, 1)
  expect(metadata.host.props.numberOfLines).toBeUndefined()
}

describe('habit row standard on Android', () => {
  it.each((['light', 'dark'] as const).flatMap((mode) => [320, 412, 1352].flatMap((width) =>
    [1, 2].flatMap((fontScale) => [false, true].flatMap((parent) => [false, true].map((reduced) => ({ mode, width, fontScale, parent, reduced })))),
  )))('contains completion hover and press feedback in $mode at $width/$fontScale, parent=$parent reduced=$reduced', ({ mode, width, fontScale, parent, reduced }) => {
    theme.mode = mode
    motion.reduced = reduced
    __setWindowDimensions({ width, height: 892, scale: 1, fontScale })
    const actions = { onLog: vi.fn(), onEdit: vi.fn(), onDetail: vi.fn() }
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = TestRenderer.create(<HabitRow
      habit={createMockHabit({ title: 'Read', description: 'Read two pages.' })} hasChildren={parent}
      today="2025-01-01" selectedDate={new Date(2025, 0, 1)}
      childrenDone={parent ? 1 : 0} childrenTotal={parent ? 3 : 0} actions={actions} />) })
    const toggle = () => tree!.root.findAllByType('Pressable').find((node: import('react-test-renderer').ReactTestInstance) => String(node.props.accessibilityLabel).includes('habits.logHabit: Read'))!
    const tokens = createTokensV2('orange', mode)
    for (const pressed of [false, true]) {
      TestRenderer.act(() => { if (pressed) toggle().props.onPressIn(); else toggle().props.onHoverIn() })
      const geometry = measureInteractionFills(tree!.toJSON(), width, pressed, fontScale)
      const target = geometry.find((part) => part.host.type === 'Pressable' && String(part.host.props.accessibilityLabel).includes('habits.logHabit: Read'))!
      const fill = geometry.find((part) => part.host.props.testID === 'habit-row-check-fill') ?? target
      const glyph = geometry.find((part) => part.host.props.testID === 'habit-check')!
      expect(target.width).toBe(48)
      expect(target.height).toBeGreaterThanOrEqual(48)
      expect(target.style.backgroundColor ?? 'transparent').toBe('transparent')
      expect(fill).toMatchObject({ width: 44, height: 44 })
      expect(fill.style).toMatchObject({ borderRadius: 20, backgroundColor: tokens.bgHover })
      expect(fill.left - glyph.left).toBe(-8)
      expect(fill.top - glyph.top).toBe(-8)
      expect(fill.left - target.left).toBe(2)
      expect(fill.top - target.top).toBe(2)
      expect(target.style.transform ?? []).toEqual(pressed && !reduced ? [{ scale: 0.96 }] : parent ? [] : [{ scale: 1 }])
      TestRenderer.act(() => { toggle().props.onHoverOut(); toggle().props.onPressOut() })
    }
    for (const action of Object.values(actions)) expect(action).not.toHaveBeenCalled()
    TestRenderer.act(() => toggle().props.onPress())
    expect(actions.onLog).toHaveBeenCalledOnce()
    expect(actions.onDetail).not.toHaveBeenCalled()
    TestRenderer.act(() => tree.unmount())
  })

  it('keeps measured checklist fit and recursive depth boundary as independent footer causes', () => {
    __setWindowDimensions({ width: 320, height: 892, scale: 1, fontScale: 1 })
    const habit = createMockHabit({ title: 'Read', checklistItems: Array.from({ length: 50 }, () => ({ text: 'Page', isChecked: true })) })
    let tree: ReturnType<typeof TestRenderer.create>
    for (const scenario of [
      { depth: 1, parent: true, supporting: true, reason: 'metadata only' },
      { depth: 2, parent: true, supporting: true, reason: 'both measurements' },
      { depth: 2, parent: false, supporting: true, reason: 'depth boundary only' },
      { depth: 1, parent: false, supporting: false, reason: 'neither measurement' },
    ]) {
      const element = <HabitRow habit={habit} depth={scenario.depth} structuralColumn hasChildren={scenario.parent}
        childrenDone={scenario.parent ? 1 : 0} childrenTotal={scenario.parent ? 3 : 0}
        actions={scenario.parent ? { onEdit: vi.fn(), onToggleExpand: vi.fn() } : {}} />
      TestRenderer.act(() => { if (tree) tree.update(element); else tree = TestRenderer.create(element) })
      const initial = measureInteractionFills(tree!.toJSON(), 284, false)
      const row = initial.find((part) => part.host.props.testID === 'habit-row')!
      const content = initial.find((part) => part.host.props.testID === 'habit-row-title-block')!
      const tokenBounds = initial.filter((part) => part.host.props.testID === 'habit-row-meta-token')
      const layoutEvent = (width: number) => ({ nativeEvent: { layout: { x: 0, y: 0, width, height: 52 } } })
      TestRenderer.act(() => {
        tree!.root.findByProps({ testID: 'habit-row' }).props.onLayout(layoutEvent(row.width))
        tree!.root.findByProps({ testID: 'habit-row-title-block' }).props.onLayout(layoutEvent(content.width))
        tree!.root.findAllByType('View').filter((node: import('react-test-renderer').ReactTestInstance) => node.props.testID === 'habit-row-meta-token')
          .forEach((node: import('react-test-renderer').ReactTestInstance, index: number) => (node.props.onLayout as (event: ReturnType<typeof layoutEvent>) => void)(layoutEvent(tokenBounds[index]!.width)))
      })
      const geometry = measureInteractionFills(tree!.toJSON(), 284, false)
      const primary = geometry.find((part) => part.host.type === 'Pressable' && 'delayLongPress' in part.host.props)!
      const strip = geometry.find((part) => part.host.props.testID === 'habit-row-meta')!
      expect(!strip.ancestors.includes(primary.slot), scenario.reason).toBe(scenario.supporting)
      expect(geometry.filter((part) => part.host.props.testID === 'habit-row-meta')).toHaveLength(1)
      const count = tree!.root.findAllByType('View').find((node: import('react-test-renderer').ReactTestInstance) => node.props.testID === 'habit-row-checklist')!
      expect(count.findByType('Text').props.children).toBe('50/50')
      expect(count.findByType('Svg').props).toMatchObject({ width: 16, strokeWidth: 1.5 })
    }
    TestRenderer.act(() => tree.unmount())
  })

  it.each(([
    { locale: 'en', caption: 'Task' },
    { locale: 'pt-BR', caption: 'Tarefa' },
  ] as const).flatMap((copy) => [1, 2].flatMap((fontScale) => [false, true].map((unavailable) => ({ ...copy, fontScale, unavailable })))))(
    'announces the short selection row caption once in $locale at $fontScale text, unavailable=$unavailable', ({ locale, caption, fontScale, unavailable }) => {
      rowLocale.value = locale
      __setWindowDimensions({ width: 320, height: 892, scale: 1, fontScale })
      const habit = createMockHabit({ title: 'Read ten minutes', frequencyUnit: null, isFlexible: false, isGeneral: false, dueTime: null })
      let tree: ReturnType<typeof TestRenderer.create>
      TestRenderer.act(() => { tree = TestRenderer.create(<HabitRow habit={habit} depth={1} hasChildren structuralColumn isSelectMode
        today="2025-01-01" selectedDate={new Date(2025, 0, 1)} completionStatusUnavailable={unavailable} />) })
      const types = tree!.root.findAllByType('Text').filter((node: import('react-test-renderer').ReactTestInstance) => node.props.testID === 'habit-row-type')
      expect(types).toHaveLength(1)
      expect(types[0]!.props.children).toBe(caption)
      const buttons = tree!.root.findAllByType('Pressable')
      const primary = buttons.find((node: import('react-test-renderer').ReactTestInstance) => node.props.delayLongPress === 500)!
      expect(primary.props.accessibilityLabel).toBe(`${habit.title}, ${caption}${unavailable ? '' : ', habits.statusDot.empty'}`)
      const selection = buttons.find((node: import('react-test-renderer').ReactTestInstance) => node.props.accessibilityRole === 'checkbox')!
      expect(selection.props.accessibilityLabel).toBe(`${habit.title}, ${caption}`)
      TestRenderer.act(() => tree.unmount())
    },
  )

  it.each([false, true])('keeps one footer type without an empty metadata strip, selecting=%s', (isSelectMode) => {
    __setWindowDimensions({ width: 320, height: 892, scale: 1, fontScale: 2 })
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = TestRenderer.create(<HabitRow habit={createMockHabit({ title: 'Leaf', dueTime: null })}
      today="2025-01-01" selectedDate={new Date(2025, 0, 1)} isSelectMode={isSelectMode} />) })
    const geometry = measureInteractionFills(tree!.toJSON(), 320, false, 2)
    const row = geometry.find((part) => part.host.props.testID === 'habit-row')!
    const types = geometry.filter((part) => part.host.props.testID === 'habit-row-type')
    expect(types).toHaveLength(1)
    const type = types[0]!
    expect(geometry.filter((part) => part.host.props.testID === 'habit-row-meta')).toHaveLength(1)
    expect(type.host.children).toEqual([en.habits.form.typeHabit])
    expect(row.bottom - type.bottom).toBeCloseTo(8, 1)
    TestRenderer.act(() => tree.unmount())
  })

  it.each([false, true])('gives the structural selection checkbox independent hover and cancellation feedback, selected=%s', (isSelected) => {
    const actions = { onToggleSelection: vi.fn(), onDetail: vi.fn(), onToggleExpand: vi.fn(), onLog: vi.fn() }
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = TestRenderer.create(<HabitRow habit={createMockHabit({ title: 'Read' })}
      structuralColumn isSelectMode isSelected={isSelected} hasChildren actions={actions} />) })
    const tokens = createTokensV2('orange', 'dark')
    const selection = tree!.root.findAllByType('Pressable').find((node: { props: Record<string, unknown> }) => node.props.accessibilityRole === 'checkbox')!
    const body = tree!.root.findAllByType('Pressable').find((node: { props: Record<string, unknown> }) => node.props.accessibilityRole === 'button' && String(node.props.accessibilityLabel).startsWith('Read'))!
    const rowStyle = () => StyleSheet.flatten(tree!.root.findByProps({ testID: 'habit-row' }).props.style)
    const outline = () => StyleSheet.flatten(tree!.root.findByProps({ testID: 'habit-row-outline' }).props.style).borderColor
    const controlStyle = (pressed = false) => StyleSheet.flatten(selection.props.style({ pressed }))
    expect(selection.props.onHoverIn).toBeTypeOf('function')
    expect(selection.props.onHoverOut).toBeTypeOf('function')
    expect(controlStyle()).toMatchObject({ width: 48, minHeight: 48, borderRadius: 999, overflow: 'hidden' })
    const restingFill = isSelected ? tokens.selectionBg : tokens.bgCard
    for (let repeat = 0; repeat < 2; repeat++) {
      TestRenderer.act(() => body.props.onHoverIn())
      expect(outline()).toBe(tokens.hairlineStrong)
      TestRenderer.act(() => body.props.onHoverOut())
      TestRenderer.act(() => selection.props.onHoverIn())
      expect(controlStyle().backgroundColor).toBe(tokens.bgHover)
      expect(controlStyle().transform ?? []).not.toContainEqual({ scale: 0.96 })
      expect(rowStyle().backgroundColor).toBe(restingFill)
      expect(outline()).toBe(tokens.hairline)
      TestRenderer.act(() => selection.props.onPressIn())
      expect(controlStyle().backgroundColor).toBe(tokens.bgHover)
      TestRenderer.act(() => selection.props.onHoverOut())
      expect(controlStyle(true)).toMatchObject({ backgroundColor: tokens.bgHover, transform: [{ scale: 0.96 }] })
      TestRenderer.act(() => selection.props.onPressOut())
      expect(controlStyle().backgroundColor).toBeUndefined()
      expect(rowStyle().backgroundColor).toBe(restingFill)
      for (const action of Object.values(actions)) expect(action).not.toHaveBeenCalled()
    }
    TestRenderer.act(() => selection.props.onPress())
    expect(actions.onToggleSelection).toHaveBeenCalledOnce()
    expect(actions.onDetail).not.toHaveBeenCalled()
    expect(actions.onLog).not.toHaveBeenCalled()
    expect(actions.onToggleExpand).not.toHaveBeenCalled()
    TestRenderer.act(() => tree.unmount())
  })
  it.each((['light', 'dark'] as const).flatMap((mode) => [320, 360, 384, 412, 1352].flatMap((width) =>
    [1, 2].flatMap((fontScale) => [0, 1, 2].map((depth) => ({ mode, width, fontScale, depth }))),
  )))('keeps bordered rows and checks in $mode at $width with $fontScale text and depth $depth', ({ mode, width, fontScale, depth }) => {
    theme.mode = mode
    __setWindowDimensions({ width, height: 892, scale: 1, fontScale })
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = TestRenderer.create(<HabitRow habit={createMockHabit({ title: 'Read' })}
      depth={depth} panelEnd={false} />) })
    const type = tree!.root.findAll((node: import('react-test-renderer').ReactTestInstance) => node.props.testID === 'habit-row-type')[0]!
    expect(type.props.children).toBe(en.habits.form.typeHabit)
    expect(type.props.numberOfLines).toBeUndefined()
    expect(StyleSheet.flatten(type.props.style)).toMatchObject({ fontSize: 12 })
    const tokens = createTokensV2('orange', mode)
    const row = tree!.root.findByProps({ testID: 'habit-row' })
    const geometry = measureInteractionFills(tree!.toJSON(), width, false, fontScale)
    const well = geometry.find((part) => part.style.borderRadius === 12 && part.style.width === (depth > 0 ? 32 : 46))!
    expect(well.left).toBe(8 + 16 * depth)
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
    expect(StyleSheet.flatten(toggle.props.style({ pressed: false }))).toMatchObject({ width: 48, minHeight: 48, borderRadius: 20 })
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
          expect(StyleSheet.flatten(indicators[0].props.style)).toMatchObject({ borderRadius: 20, outlineOffset: -2, top: 2, right: 2, bottom: 2, left: 2 })
        }
        TestRenderer.act(() => tree.unmount())
      }
    }
  })
})


it.each((['en', 'pt-BR'] as const).flatMap((locale) => [320, 412, 1352].flatMap((width) => [1, 2].flatMap((fontScale) => [0, 1, 2].flatMap((depth) =>
  [false, true].flatMap((parent) => [false, true].flatMap((described) => [undefined, false, true].map((selected) => ({ locale, width, fontScale, depth, parent, described, selected })))),
)))))(
  'measures native feedback in $locale at $width/$fontScale, depth=$depth parent=$parent description=$described selected=$selected', ({ locale, width, fontScale, depth, parent, described, selected }) => {
    rowLocale.value = locale
    __setWindowDimensions({ width, height: 892, scale: 1, fontScale })
    const tokens = createTokensV2('orange', 'dark')
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = TestRenderer.create(<HabitRow habit={createMockHabit({ title: 'Read ten minutes', description: described ? 'Read two pages before breakfast. '.repeat(12) : null, dueTime: '08:00', frequencyUnit: selected === false ? null : 'Day' })}
      today="2025-01-01" selectedDate={new Date(2025, 0, 1)} depth={depth} hasChildren={parent} childrenDone={parent ? 1 : 0} childrenTotal={parent ? 3 : 0}
      structuralColumn isSelectMode={selected !== undefined} isSelected={selected} actions={{ onEdit: vi.fn(), onDetail: vi.fn(), onToggleSelection: vi.fn() }} />) })
    const body = tree!.root.findAllByType('Pressable').find((node: { props: Record<string, unknown> }) => node.props.accessibilityRole === 'button' && String(node.props.accessibilityLabel).startsWith('Read ten minutes'))!
    const measure = () => measureInteractionFills(tree!.toJSON(), width, false, fontScale)
    const geometry = measure()
    const supportingMeta = fontScale === 2 || width === 320 && depth === 2
    assertTypePlacement(geometry, fontScale, depth, supportingMeta)
    const row = geometry.find((part) => part.host.props.testID === 'habit-row')!
    const check = geometry.find((part) => part.host.props.testID === 'habit-check')!
    const target = geometry.find((part) => check.ancestors.includes(part.slot) && part.width === 48)!
    expect(Math.abs((check.left + check.right) / 2 - (target.left + target.right) / 2)).toBeLessThanOrEqual(1)
    expect(Math.abs((check.top + check.bottom) / 2 - (target.top + target.bottom) / 2)).toBeLessThanOrEqual(1)
    if (!supportingMeta) expect(Math.abs((target.top + target.bottom) / 2 - (row.top + row.bottom) / 2)).toBeLessThanOrEqual(1)
    else expect(target.top - row.top).toBe(depth ? 4 : 8)
    expect(target.width).toBe(48)
    const title = geometry.find((part) => part.host.type === 'Text' && part.host.children?.includes('Read ten minutes') && part.style.opacity !== 0)!
    expect((title.style as import('react-native').TextStyle).fontSize).toBe(depth ? 14 : 17)
    expect(title.width).toBeGreaterThanOrEqual(Number((title.style as import('react-native').TextStyle).fontSize) * fontScale)
    if (supportingMeta) expect(target.top).toBeCloseTo(title.top, 1)
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
    const controls = tree!.root.findAllByType('Pressable').filter((node: import('react-test-renderer').ReactTestInstance) => node !== body)
    for (const control of controls) {
      expect(control.props.onHoverIn).toBeTypeOf('function')
      expect(control.props.onHoverOut).toBeTypeOf('function')
      TestRenderer.act(() => control.props.onHoverIn())
      const paints = measure().filter((part) => part.style.backgroundColor === tokens.bgHover)
      expect(paints).toHaveLength(1)
      expect(['Pressable', 'View']).toContain(paints[0]!.host.type)
      expect(paints[0]!.style.transform ?? []).not.toContainEqual({ scale: 0.96 })
      expect(StyleSheet.flatten(tree!.root.findByProps({ testID: 'habit-row' }).props.style).backgroundColor).toBe(selected ? tokens.selectionBg : tokens.bgCard)
      TestRenderer.act(() => control.props.onHoverOut())
      expect(measure().filter((part) => part.style.backgroundColor === tokens.bgHover)).toHaveLength(0)
    }
    TestRenderer.act(() => tree.unmount())
  },
)

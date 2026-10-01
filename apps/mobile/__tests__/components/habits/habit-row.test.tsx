import { afterEach, describe, it, expect, vi, beforeEach } from 'vitest'
import { neutralColors } from '@orbit/shared/theme'
import { createMockHabit } from '@orbit/shared/__tests__/factories'
import { HabitRow } from '@/components/habits/habit-row'
import { Menu } from '@/components/ui/menu'
import { Icon } from '@/components/ui/icon'
import { useOfflineSyncStore } from '@/stores/offline-sync-store'
import { StyleSheet } from 'react-native'
import { createTokensV2 } from '@/lib/theme'
import {
  __resetTestHostConfig,
  __setHostRefsNull,
  __setMeasureInWindowImpl,
} from '@/test-mocks/react-native'

const PINNED_TEST_TIME = new Date('2026-09-12T09:00:00.000Z')
vi.setSystemTime(PINNED_TEST_TIME)
beforeEach(() => vi.setSystemTime(PINNED_TEST_TIME))
afterEach(() => vi.useRealTimers())

const TestRenderer = require('react-test-renderer')

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}))

vi.mock('@/hooks/use-time-format', () => ({
  useTimeFormat: () => ({ displayTime: (value: string) => value }),
}))

vi.mock('@/lib/use-app-theme', () => ({
  useAppTheme: () => ({ currentScheme: 'purple', currentTheme: 'dark' }),
}))

vi.mock('@/lib/motion', () => ({
  usePrefersReducedMotion: () => true,
  useResolvedMotionPreset: () => ({
    enterDuration: 0,
    exitDuration: 0,
    scaleFrom: 0.96,
    scaleTo: 1,
    shift: 8,
  }),
  toAnimatedEasing: (value: unknown) => value,
}))

function collectStrings(node: unknown): string[] {
  if (node == null) return []
  if (typeof node === 'string') return [node]
  if (Array.isArray(node)) return node.flatMap(collectStrings)
  return collectStrings((node as { children?: unknown }).children)
}

function renderRowText(habit: ReturnType<typeof createMockHabit>): string[] {
  let tree: { toJSON: () => unknown }
  TestRenderer.act(() => {
    tree = TestRenderer.create(<HabitRow habit={habit} />)
  })
  return collectStrings(tree!.toJSON())
}

describe('HabitRow canonical content (mobile)', () => {
  it('shows time alone and omits routine meta on an untimed single row', () => {
    const timed = renderRowText(createMockHabit({ dueTime: '21:00' }))
    expect(timed).toContain('21:00')
    expect(timed.some((text) => text.includes('habits.frequency'))).toBe(false)
    const untimed = renderRowText(createMockHabit({ checklistItems: [{ text: 'One', isChecked: true }] }))
    expect(untimed.some((text) => text.includes('habits.frequency'))).toBe(false)
    expect(untimed).not.toContain('1/1')
  })

  it('shows child progress instead of the parent schedule', () => {
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => {
      tree = TestRenderer.create(<HabitRow habit={createMockHabit({ dueTime: '21:00' })}
        hasChildren childrenDone={1} childrenTotal={2} />)
    })
    const text = collectStrings(tree!.toJSON())
    expect(text).toContain('habits.rowProgress')
    expect(text).not.toContain('21:00')
  })

  it.each([
    { label: 'ordinary', isOverdue: false, isBadHabit: false, isCompleted: false, isLoggedInRange: false,
      words: [], state: 'empty' },
    { label: 'overdue', isOverdue: true, isBadHabit: false, isCompleted: false, isLoggedInRange: false,
      words: ['habits.overdue'], state: 'overdue' },
    { label: 'completed slip', isOverdue: false, isBadHabit: true, isCompleted: true, isLoggedInRange: false,
      words: ['habits.statusDot.bad'], state: 'bad' },
    { label: 'recorded slip', isOverdue: true, isBadHabit: true, isCompleted: false, isLoggedInRange: true,
      words: ['habits.overdue', 'habits.statusDot.bad'], state: 'bad' },
    { label: 'unrecorded bad habit', isOverdue: false, isBadHabit: true, isCompleted: false, isLoggedInRange: false,
      words: [], state: 'bad' },
    { label: 'completed overdue habit', isOverdue: true, isBadHabit: false, isCompleted: true, isLoggedInRange: false,
      words: [], state: 'done' },
  ])('renders parent progress with applicable state words for $label', ({ label, words, state, ...flags }) => {
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => {
      tree = TestRenderer.create(<HabitRow habit={createMockHabit({ title: label,
        dueTime: '21:00', hasSubHabits: true, ...flags })}
        hasChildren childrenDone={1} childrenTotal={2} />)
    })
    const text = collectStrings(tree!.toJSON())
    expect(text.filter((part) => part.startsWith('habits.rowProgress') || words.includes(part)))
      .toEqual(['habits.rowProgress', ...words])
    for (const word of ['habits.overdue', 'habits.statusDot.bad']) {
      if (!words.includes(word)) expect(text).not.toContain(word)
    }
    expect(text).not.toContain('21:00')
    const body = tree!.root.findAllByType('Pressable').find(
      (node: { props: Record<string, unknown> }) => node.props.delayLongPress === 500,
    )
    const supplementaryWords = state === 'bad' && flags.isOverdue ? ['habits.overdue'] : []
    expect(body.props.accessibilityLabel).toBe(
      [label, `habits.statusDot.${state}`, 'habits.rowProgress', ...supplementaryWords].join(', '),
    )
    expect(body.props.accessibilityHint).toBeUndefined()
    expect(tree!.root.findAllByType('Pressable').some(
      (node: { props: Record<string, unknown> }) =>
        node.props.accessibilityLabel === `habits.statusDot.${state}, habits.${flags.isCompleted || flags.isLoggedInRange ? 'actions.unlog' : 'logHabit'}: ${label}, 1/2`,
    )).toBe(true)
    TestRenderer.act(() => tree.unmount())
  })

  it.each([false, true])('uses the empty track for parent selection mode %s', (isSelectMode) => {
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => {
      tree = TestRenderer.create(<HabitRow habit={createMockHabit()} hasChildren
        childrenDone={1} childrenTotal={2} isSelectMode={isSelectMode} />)
    })
    const circles = tree!.root.findAllByType('Circle')
    expect(circles[0].props.stroke).toBe(createTokensV2('purple', 'dark').trackEmpty)
  })

  it('shows a one-day habit row without an internal type label', () => {
    const texts = renderRowText(createMockHabit({ title: 'Pay bill', frequencyUnit: null, frequencyQuantity: null, dueTime: '08:00' }))
    expect(texts).toContain('Pay bill')
    expect(texts).toContain('08:00')
    expect(texts).not.toContain('habits.oneTimeTask')
  })

  it('omits the structural column by default and indents only a child body', () => {
    let renderer: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => {
      renderer = TestRenderer.create(<HabitRow habit={createMockHabit({ title: 'Child' })} depth={1} />)
    })
    const row = renderer!.root.findByProps({ testID: 'habit-row' })
    expect(row.children[0].children[0].props.delayLongPress).toBe(500)
    expect(StyleSheet.flatten(row.props.style).paddingLeft).toBeUndefined()
    expect(StyleSheet.flatten(row.children[0].children[0].props.style({ pressed: false })).paddingLeft).toBe(24)
  })

  it('keeps separate selection and structural columns with a neutral checkbox', () => {
    const onToggleExpand = vi.fn()
    const onToggleSelection = vi.fn()
    let renderer: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => {
      renderer = TestRenderer.create(<HabitRow habit={createMockHabit({ title: 'Parent' })}
        structuralColumn isSelectMode isSelected hasChildren isExpanded childrenDone={1} childrenTotal={2}
        actions={{ onToggleExpand, onToggleSelection }} />)
    })
    const row = renderer!.root.findByProps({ testID: 'habit-row' })
    const [selection, disclosureColumn, body] = row.children[0].children
    expect(selection.props.accessibilityState).toMatchObject({ checked: true })
    const disclosure = disclosureColumn.findByProps({ accessibilityLabel: 'common.collapse' })
    expect(disclosure.props.accessibilityState).toMatchObject({ expanded: true })
    expect(body.props.delayLongPress).toBe(500)
    const checkbox = selection.findAll((node: { props: { pointerEvents?: string } }) => node.props.pointerEvents === 'none')[0]
    expect(StyleSheet.flatten(checkbox.props.style).backgroundColor).toBe(createTokensV2('purple', 'dark').fg1)
    TestRenderer.act(() => disclosure.props.onPress())
    expect(onToggleExpand).toHaveBeenCalledOnce()
    expect(onToggleSelection).not.toHaveBeenCalled()
    expect(renderer!.root.findAllByProps({ accessibilityLabel: 'habits.statusDot.empty, 1/2' }).length).toBeGreaterThan(0)
    expect(renderer!.root.findAll((node: { props: { accessibilityLabel?: string; accessibilityRole?: string } }) =>
      node.props.accessibilityLabel?.startsWith('habits.statusDot.empty') && node.props.accessibilityRole === 'button')).toHaveLength(0)
  })

  it('keeps the leaf spacer and status glyph while selecting', () => {
    let renderer: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => {
      renderer = TestRenderer.create(<HabitRow habit={createMockHabit({ title: 'Leaf' })} structuralColumn isSelectMode />)
    })
    const row = renderer!.root.findByProps({ testID: 'habit-row' })
    const [selection, spacer, body] = row.children[0].children
    expect(selection.props.accessibilityState).toMatchObject({ checked: false })
    expect(spacer.findAll((node: { props: { accessibilityRole?: string } }) => node.props.accessibilityRole === 'button')).toHaveLength(0)
    expect(body.props.delayLongPress).toBe(500)
    expect(renderer!.root.findAllByProps({ testID: 'status-ring' }).length).toBeGreaterThan(0)
  })
  it('omits descriptions and tags from the canonical row', () => {
    const texts = renderRowText(
      createMockHabit({
        title: 'Read',
        description: 'A long preview',
        tags: [
          { id: '1', name: 'Learning', color: '#7c3aed' },
          { id: '2', name: 'Evening', color: '#10b981' },
        ],
      }),
    )

    expect(texts).toContain('Read')
    expect(texts).not.toContain('A long preview')
    expect(texts).not.toContain('Learning')
    expect(texts).not.toContain('Evening')
  })

  it('uses the first uppercase letter when an emoji is missing', () => {
    const texts = renderRowText(
      createMockHabit({
        title: 'read',
        emoji: null,
      }),
    )

    expect(texts).toContain('R')
  })

  it.each([
    { depth: 0, color: createTokensV2('purple', 'dark').fg1 },
    { depth: 1, color: createTokensV2('purple', 'dark').fg2 },
  ] as const)('keeps done and pending titles alike at depth $depth', ({ depth, color }) => {
    const styles: Record<string, unknown>[] = []
    for (const isCompleted of [false, true]) {
      let renderer: ReturnType<typeof TestRenderer.create>
      TestRenderer.act(() => {
        renderer = TestRenderer.create(
          <HabitRow habit={createMockHabit({ title: 'Read', isCompleted })} depth={depth} />,
        )
      })
      const title = renderer!.root.findAllByType('Text').find(
        (node: { children: unknown[] }) => node.children.includes('Read'),
      )
      expect(title).toBeDefined()
      styles.push(StyleSheet.flatten(title!.props.style) as Record<string, unknown>)
      TestRenderer.act(() => renderer.unmount())
    }
    expect(styles[0]).toMatchObject({ color })
    expect(styles[1]).toMatchObject({ color })
    expect(styles[0]?.textDecorationLine).not.toBe('line-through')
    expect(styles[1]?.textDecorationLine).not.toBe('line-through')
  })
})

describe('HabitRow status control names (mobile)', () => {
  it('updates the body metadata while its title and primary state stay the same', () => {
    const onDetail = vi.fn()
    const habit = createMockHabit({ title: 'Evening routine', isBadHabit: true, isLoggedInRange: true })
    let renderer: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => {
      renderer = TestRenderer.create(<HabitRow habit={habit} actions={{ onDetail }} />)
    })
    const body = () => renderer!.root.findAllByType('Pressable').find(
      (node: { props: Record<string, unknown> }) => node.props.delayLongPress === 500,
    )
    expect(body().props.accessibilityLabel).toBe('Evening routine, habits.statusDot.bad')
    TestRenderer.act(() => {
      renderer.update(<HabitRow habit={{ ...habit, isOverdue: true }} hasChildren
        childrenDone={1} childrenTotal={2} actions={{ onDetail }} />)
    })
    expect(body().props.accessibilityLabel).toBe(
      'Evening routine, habits.statusDot.bad, habits.rowProgress, habits.overdue',
    )
    TestRenderer.act(() => body().props.onPress())
    expect(onDetail).toHaveBeenCalledOnce()
    TestRenderer.act(() => renderer.unmount())
  })

  it('includes a single row time range and keeps its future hint separate', () => {
    let renderer: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => {
      renderer = TestRenderer.create(<HabitRow habit={createMockHabit({ title: 'Read',
        dueTime: '08:00', dueEndTime: '09:00', dueDate: '2026-09-15' })} />)
    })
    const body = renderer!.root.findAllByType('Pressable').find(
      (node: { props: Record<string, unknown> }) => node.props.delayLongPress === 500,
    )
    expect(body.props.accessibilityLabel).toBe('Read, habits.statusDot.empty, 08:00 - 09:00')
    expect(body.props.accessibilityHint).toBe('habits.schedule.dueInDays')
    TestRenderer.act(() => renderer.unmount())
  })

  it('reports the row overflow menu state through open and close', () => {
    let renderer: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => {
      renderer = TestRenderer.create(<HabitRow habit={createMockHabit({ title: 'Read' })} actions={{ onEdit: vi.fn() }} />)
    })
    const button = () => renderer!.root.findAll((node: { props: { accessibilityLabel?: string } }) =>
      node.props.accessibilityLabel === 'habits.actions.more')[0]
    expect(button().props.accessibilityState).toMatchObject({ expanded: false })
    TestRenderer.act(() => button().props.onPress())
    expect(button().props.accessibilityState).toMatchObject({ expanded: true })
    TestRenderer.act(() => renderer!.root.findByType(Menu).props.onClose())
    expect(button().props.accessibilityState).toMatchObject({ expanded: false })
  })
  it('announces why child completion is unavailable while keeping its body openable', () => {
    const onDetail = vi.fn()
    let renderer: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => {
      renderer = TestRenderer.create(
        <HabitRow habit={createMockHabit({ title: 'Read' })} completionReadOnly completionStatusUnavailable
          completionReason="We could not load this day's habits."
          actions={{ onDetail }} />,
      )
    })

    const ring = renderer!.root.findAll(
      (node: { props: Record<string, unknown> }) =>
        node.props.accessibilityHint === "We could not load this day's habits." &&
        node.props.accessibilityRole === 'button',
    )[0]
    expect(ring.props.accessibilityState).toEqual({ disabled: true })
    expect(ring.props.accessibilityLabel).toBe('habits.logHabit: Read')
    const unavailableDot = renderer!.root.findByProps({ testID: 'unavailable-status-dot' })
    expect(StyleSheet.flatten(unavailableDot.props.style)).toMatchObject({
      width: 30,
      height: 30,
      backgroundColor: neutralColors.dark.bgWell,
    })
    expect(renderer!.root.findAllByProps({ testID: 'status-ring' })).toHaveLength(0)
    const body = renderer!.root.findAll(
      (node: { props: Record<string, unknown> }) => node.props.delayLongPress === 500,
    )[0]
    expect(body.props.accessibilityLabel).toBe('Read')
    TestRenderer.act(() => body.props.onPress())
    expect(onDetail).toHaveBeenCalledOnce()
    TestRenderer.act(() => {
      renderer!.update(<HabitRow habit={createMockHabit({ title: 'Read' })} actions={{ onDetail }} />)
    })
    expect(renderer!.root.findAllByProps({ testID: 'status-ring' }).length).toBeGreaterThan(0)
    expect(renderer!.root.findAllByProps({ testID: 'unavailable-status-dot' })).toHaveLength(0)
  })

  it('paints the body hit area and ring independently', () => {
    let renderer: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => {
      renderer = TestRenderer.create(
        <HabitRow
          habit={createMockHabit({ title: 'Meditate' })}
          structuralColumn
          hasChildren
          childrenDone={0}
          childrenTotal={1}
          actions={{ onLog: vi.fn() }}
        />,
      )
    })

    const body = renderer!.root.findAll(
      (node: { props: Record<string, unknown> }) => node.props.delayLongPress === 500,
    )[0]
    const ring = renderer!.root.findAll(
      (node: { props: Record<string, unknown> }) =>
        node.props.accessibilityLabel === 'habits.statusDot.empty, habits.logHabit: Meditate, 0/1' &&
        typeof node.props.style === 'function',
    )[0]

    TestRenderer.act(() => body.props.onPressIn())
    const pressedCard = StyleSheet.flatten(
      renderer!.root.findByProps({ testID: 'habit-row' }).props.style,
    ) as Record<string, unknown>
    const restingRing = StyleSheet.flatten(ring.props.style({ pressed: false })) as Record<string, unknown>
    expect(pressedCard.backgroundColor).toBe('rgba(250,250,250,0.04)')
    expect(pressedCard.borderColor).toBe('rgba(255,255,255,0.16)')
    expect(StyleSheet.flatten(body.props.style({ pressed: true }))).toMatchObject({
      backgroundColor: 'rgba(250,250,250,0.13)',
      borderRadius: 20,
      overflow: 'hidden',
    })
    expect(restingRing.backgroundColor).toBeUndefined()

    TestRenderer.act(() => body.props.onPressOut())
    const restingCard = StyleSheet.flatten(
      renderer!.root.findByProps({ testID: 'habit-row' }).props.style,
    ) as Record<string, unknown>
    const pressedRing = StyleSheet.flatten(ring.props.style({ pressed: true })) as Record<string, unknown>
    expect(restingCard.backgroundColor).toBe('rgba(250,250,250,0.04)')
    expect(pressedRing.backgroundColor).toBe('rgba(250,250,250,0.13)')
  })

  it('presses the disclosure control without painting the card', () => {
    let renderer: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => {
      renderer = TestRenderer.create(
        <HabitRow
          habit={createMockHabit({ title: 'Meditate' })}
          structuralColumn
          hasChildren
          actions={{ onToggleExpand: vi.fn() }}
        />,
      )
    })

    const disclosure = renderer!.root.findByProps({ accessibilityLabel: 'common.expand' })
    const pressedDisclosure = StyleSheet.flatten(
      disclosure.props.style({ pressed: true }),
    ) as Record<string, unknown>
    const restingCard = StyleSheet.flatten(
      renderer!.root.findByProps({ testID: 'habit-row' }).props.style,
    ) as Record<string, unknown>

    expect(pressedDisclosure.backgroundColor).toBe('rgba(250,250,250,0.13)')
    expect(restingCard.backgroundColor).toBe('rgba(250,250,250,0.04)')
  })

  it('presses the selection control without painting the card', () => {
    let renderer: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => {
      renderer = TestRenderer.create(
        <HabitRow
          habit={createMockHabit({ title: 'Meditate' })}
          structuralColumn
          isSelectMode
          actions={{ onToggleSelection: vi.fn() }}
        />,
      )
    })

    const selection = renderer!.root.findAll(
      (node: { props: Record<string, unknown> }) =>
        node.props.accessibilityLabel === 'Meditate' && typeof node.props.style === 'function',
    )[0]
    const pressedSelection = StyleSheet.flatten(
      selection.props.style({ pressed: true }),
    ) as Record<string, unknown>
    const restingCard = StyleSheet.flatten(
      renderer!.root.findByProps({ testID: 'habit-row' }).props.style,
    ) as Record<string, unknown>

    expect(pressedSelection.backgroundColor).toBe('rgba(250,250,250,0.13)')
    expect(restingCard.backgroundColor).toBe('rgba(250,250,250,0.04)')
  })

  it('uses a 500 ms still hold for selection', () => {
    let renderer: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => {
      renderer = TestRenderer.create(
        <HabitRow
          habit={createMockHabit({ title: 'Meditate' })}
          actions={{ onLongPressCard: vi.fn() }}
        />,
      )
    })

    const body = renderer!.root.findAll(
      (node: { props: Record<string, unknown> }) => node.props.delayLongPress === 500,
    )[0]
    expect(body).toBeDefined()
  })

  it('announces the habit name with the state and log action', () => {
    let renderer: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => {
      renderer = TestRenderer.create(
        <HabitRow habit={createMockHabit({ title: 'Meditate' })} />,
      )
    })

    expect(
      renderer!.root.findByProps({
        accessibilityLabel: 'habits.statusDot.empty, habits.logHabit: Meditate',
      }),
    ).toBeDefined()
  })

  it('announces parent progress and the parent action', () => {
    let renderer: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => {
      renderer = TestRenderer.create(
        <HabitRow
          habit={createMockHabit({ title: 'Morning routine' })}
          hasChildren
          childrenDone={1}
          childrenTotal={2}
        />,
      )
    })

    expect(
      renderer!.root.findByProps({
        accessibilityLabel:
          'habits.statusDot.empty, habits.logHabit: Morning routine, 1/2',
      }),
    ).toBeDefined()
  })

  it('logs a parent with open children directly from its ring', () => {
    const onLog = vi.fn()
    let renderer: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => {
      renderer = TestRenderer.create(
        <HabitRow
          habit={createMockHabit({ title: 'Morning routine' })}
          hasChildren
          childrenDone={1}
          childrenTotal={2}
          actions={{ onLog }}
        />,
      )
    })

    const ring = renderer!.root.findByProps({
      accessibilityLabel: 'habits.statusDot.empty, habits.logHabit: Morning routine, 1/2',
    })
    TestRenderer.act(() => ring.props.onPress())
    expect(onLog).toHaveBeenCalledOnce()
  })
})

function renderRowWithMenu() {
  let renderer: ReturnType<typeof TestRenderer.create>
  TestRenderer.act(() => {
    renderer = TestRenderer.create(
      <HabitRow
        habit={createMockHabit({ title: 'Read' })}
        actions={{ onEdit: vi.fn() }}
      />,
    )
  })
  return renderer!
}

function pressMoreButton(renderer: ReturnType<typeof TestRenderer.create>) {
  const moreButton = renderer.root.findAll(
    (node: { props: Record<string, unknown> }) =>
      node.props.accessibilityLabel === 'habits.actions.more',
  )[0]
  TestRenderer.act(() => {
    ;(moreButton.props.onPress as () => void)()
  })
}

describe('HabitRow menu (mobile)', () => {
  afterEach(() => {
    __resetTestHostConfig()
  })

  it('matches the drawn menu for an overdue parent on a free plan', () => {
    let renderer: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => {
      renderer = TestRenderer.create(<HabitRow habit={createMockHabit({ title: 'Walk', isOverdue: true, hasSubHabits: true })}
        hasChildren hasProAccess={false} actions={{ onAddSubHabit: vi.fn(), onMoveParent: vi.fn(),
          onSkip: vi.fn(), onReschedule: vi.fn(), onEdit: vi.fn(), onDuplicate: vi.fn(),
          onEnterSelectMode: vi.fn(), onDrillInto: vi.fn(), onDelete: vi.fn() }} />)
    })
    const menu = renderer!.root.findByType(Menu)
    expect(menu.props.title).toBe('Walk')
    expect(menu.props.items.map((item: { label: string }) => item.label)).toEqual([
      'habits.actions.addSubHabit', 'habits.actions.moveUnder', 'habits.actions.skip',
      'habits.actions.reschedule', 'common.edit', 'habits.actions.duplicate',
      'common.select', 'habits.actions.openSubHabits', 'habits.actions.delete',
    ])
    expect(menu.props.items.map((item: { icon?: string }) => item.icon)).toEqual([
      'subtask', 'arrows-move', 'player-skip-forward', 'calendar-time', 'pencil',
      'copy', 'checkbox', 'list-tree', 'trash',
    ])
    expect(menu.props.items[0].badge).toBe('Pro')
    expect(menu.props.items[8].destructive).toBe(true)
    pressMoreButton(renderer)
    const icons = renderer!.root.findAllByType(Icon)
    expect(icons.map((icon: { props: { name: string } }) => icon.props.name)).toEqual([
      'subtask', 'arrows-move', 'player-skip-forward', 'calendar-time', 'pencil',
      'copy', 'checkbox', 'list-tree', 'trash',
    ])
    expect(icons.every((icon: { props: { size: number; strokeWidth: number } }) =>
      icon.props.size === 20 && icon.props.strokeWidth === 2)).toBe(true)
    expect(icons[8].props.color).toBe(createTokensV2('purple', 'dark').statusBad)
  })

  it('omits overdue and child actions when their row conditions do not apply', () => {
    let renderer: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => {
      renderer = TestRenderer.create(<HabitRow habit={createMockHabit({ title: 'Read' })} hasProAccess
        actions={{ onAddSubHabit: vi.fn(), onReschedule: vi.fn(), onDrillInto: vi.fn(), onEnterSelectMode: vi.fn() }} />)
    })
    const menu = renderer!.root.findByType(Menu)
    expect(menu.props.items.map((item: { id: string }) => item.id)).toEqual(['add', 'select'])
    expect(menu.props.items[0].badge).toBeUndefined()
    expect(menu.props.title).toBe('Read')
  })

  it('keeps drill navigation when stored children are filtered out of the visible row', () => {
    const onDrillInto = vi.fn()
    let renderer: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => {
      renderer = TestRenderer.create(
        <HabitRow habit={createMockHabit({ title: 'Morning routine', hasSubHabits: true })}
          hasChildren={false} actions={{ onDrillInto }} />,
      )
    })

    const menu = renderer!.root.findByType(Menu)
    expect(menu.props.items.map((item: { id: string }) => item.id)).toContain('drill')
    TestRenderer.act(() => menu.props.onSelect('drill'))
    expect(onDrillInto).toHaveBeenCalledOnce()
  })

  it('removes the menu while selecting rows', () => {
    let renderer: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => {
      renderer = TestRenderer.create(<HabitRow habit={createMockHabit({ title: 'Walk' })} isSelectMode
        actions={{ onEnterSelectMode: vi.fn(), onEdit: vi.fn() }} />)
    })
    expect(renderer!.root.findByType(Menu).props.open).toBe(false)
    expect(renderer!.root.findAllByProps({ accessibilityLabel: 'habits.actions.more' })).toHaveLength(0)
  })

  it('keeps only the second row menu open when another row opens', () => {
    let renderer: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => {
      renderer = TestRenderer.create(<>
        <HabitRow habit={createMockHabit({ id: 'first', title: 'Meditate' })} actions={{ onEdit: vi.fn() }} />
        <HabitRow habit={createMockHabit({ id: 'second', title: 'Run' })} actions={{ onDelete: vi.fn() }} />
      </>)
    })

    const triggers = renderer!.root.findAllByType('Pressable').filter(
      (node: { props: Record<string, unknown> }) => node.props.accessibilityLabel === 'habits.actions.more',
    )
    TestRenderer.act(() => (triggers[0]!.props.onPress as () => void)())
    expect(collectStrings(renderer!.toJSON())).toContain('common.edit')

    TestRenderer.act(() => (triggers[1]!.props.onPress as () => void)())
    expect(collectStrings(renderer!.toJSON())).toContain('habits.actions.delete')
    expect(collectStrings(renderer!.toJSON())).not.toContain('common.edit')
  })

  it('opens the menu even when measureInWindow never invokes its callback', () => {
    __setMeasureInWindowImpl(() => {})
    const renderer = renderRowWithMenu()

    pressMoreButton(renderer)

    expect(collectStrings(renderer.toJSON())).toContain('common.edit')
  })

  it('opens the menu even when the anchor ref is null', () => {
    __setHostRefsNull(true)
    const renderer = renderRowWithMenu()

    pressMoreButton(renderer)

    expect(collectStrings(renderer.toJSON())).toContain('common.edit')
  })

  it('keeps a future row and its menu live while withholding completion actions', () => {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000)
    const onDetail = vi.fn()
    const onLog = vi.fn()
    let renderer: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => {
      renderer = TestRenderer.create(
        <HabitRow
          habit={createMockHabit({ title: 'Future habit', frequencyUnit: 'Day' })}
          selectedDate={tomorrow}
          actions={{ onDetail, onLog, onSkip: vi.fn(), onEdit: vi.fn() }}
        />,
      )
    })

    const body = renderer!.root.findAll(
      (node: { props: Record<string, unknown> }) => node.props.delayLongPress === 500,
    )[0]!
    const ring = renderer!.root.findByProps({
      accessibilityLabel: 'habits.statusDot.empty, habits.logHabit: Future habit',
    })
    const rowStyle = StyleSheet.flatten(
      renderer!.root.findByProps({ testID: 'habit-row' }).props.style,
    )

    expect(body.props.disabled).not.toBe(true)
    expect(ring.props.disabled).toBe(true)
    expect(rowStyle.opacity).not.toBe(0.5)
    TestRenderer.act(() => body.props.onPress())
    expect(onDetail).toHaveBeenCalledOnce()

    pressMoreButton(renderer)
    const text = collectStrings(renderer.toJSON())
    expect(text).toContain('common.edit')
    expect(text).not.toContain('habits.actions.skip')
    expect(onLog).not.toHaveBeenCalled()
  })
})


describe('offline row presentation', () => {
  it('keeps the logged row identical while recovery notices exist', () => {
    const habit = createMockHabit({ title: 'Walk', isCompleted: true })
    let tree: { toJSON: () => unknown; update: (element: React.ReactNode) => void; unmount: () => void }
    TestRenderer.act(() => { tree = TestRenderer.create(<HabitRow habit={habit} />) })
    const onlineRow = JSON.stringify(tree!.toJSON())
    TestRenderer.act(() => {
      useOfflineSyncStore.setState({ drops: [{ id: 'lost-log', type: 'logHabit', lastError: '500', mutation: {
        id: 'lost-log', type: 'logHabit', timestamp: 1, retries: 3, maxRetries: 3,
        endpoint: '/api/habits/walk/log', method: 'POST', payload: null,
      } }] })
      tree.update(<HabitRow habit={habit} />)
    })
    expect(JSON.stringify(tree!.toJSON())).toBe(onlineRow)
    TestRenderer.act(() => { tree.unmount(); useOfflineSyncStore.setState({ drops: [] }) })
  })
})

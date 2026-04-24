import { describe, expect, it, vi, beforeEach } from 'vitest'
import { HabitCard } from '@/components/habit-card'
import type { NormalizedHabit } from '@orbit/shared/types/habit'

const TestRenderer = require('react-test-renderer')

const colorProxy: any = new Proxy(
  {},
  {
    get: (_target, prop) => (prop === 'white' ? '#ffffff' : '#111111'),
  },
)

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

vi.mock('@/hooks/use-time-format', () => ({
  useTimeFormat: () => ({
    displayTime: (value: string | null | undefined) => value ?? '',
  }),
}))

vi.mock('@/lib/use-app-theme', () => ({
  useAppTheme: () => ({
    colors: colorProxy,
  }),
}))

vi.mock('@/lib/theme', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/theme')>()
  return {
    ...actual,
    createColors: () => colorProxy,
  }
})

vi.mock('@/components/ui/anchored-menu', () => ({
  AnchoredMenu: ({ visible, children }: any) => (visible ? children : null),
}))

vi.mock('lucide-react-native', () => {
  const React = require('react')
  const createIcon = (name: string) => (props: any) => React.createElement(name, props)
  return {
    ArrowRight: createIcon('ArrowRight'),
    Check: createIcon('Check'),
    CheckCircle2: createIcon('CheckCircle2'),
    ChevronRight: createIcon('ChevronRight'),
    ClipboardCheck: createIcon('ClipboardCheck'),
    Copy: createIcon('Copy'),
    FastForward: createIcon('FastForward'),
    Flame: createIcon('Flame'),
    MoreVertical: createIcon('MoreVertical'),
    Pencil: createIcon('Pencil'),
    Plus: createIcon('Plus'),
    Trash2: createIcon('Trash2'),
  }
})

vi.mock('react-native-svg', () => {
  const React = require('react')
  return {
    default: (props: any) => React.createElement('Svg', props),
    Circle: (props: any) => React.createElement('Circle', props),
  }
})

function findOuterCardTouchables(root: any) {
  return root.findAll(
    (node: any) =>
      node.type === 'TouchableOpacity' &&
      typeof node.props.onPress === 'function' &&
      'onLongPress' in node.props,
  )
}

function hasDimmedStyle(style: unknown): boolean {
  if (!style) return false
  if (Array.isArray(style)) {
    return style.some((entry) => hasDimmedStyle(entry))
  }
  return typeof style === 'object' && style !== null && 'opacity' in style && (style as { opacity?: number }).opacity === 0.4
}

function hasBorderLeftWidth(style: unknown, width: number): boolean {
  if (!style) return false
  if (Array.isArray(style)) {
    return style.some((entry) => hasBorderLeftWidth(entry, width))
  }
  return typeof style === 'object' && style !== null && 'borderLeftWidth' in style && (style as { borderLeftWidth?: number }).borderLeftWidth === width
}

function createMockHabit(overrides: Partial<NormalizedHabit> = {}): NormalizedHabit {
  return {
    id: 'habit-1',
    title: 'Exercise',
    description: null,
    frequencyUnit: 'Day',
    frequencyQuantity: 1,
    isBadHabit: false,
    isCompleted: false,
    isGeneral: false,
    isFlexible: false,
    days: [],
    dueDate: '2025-01-01',
    dueTime: null,
    dueEndTime: null,
    endDate: null,
    position: null,
    checklistItems: [],
    createdAtUtc: '2025-01-01T00:00:00Z',
    parentId: null,
    scheduledDates: ['2025-01-01'],
    isOverdue: false,
    reminderEnabled: false,
    reminderTimes: [],
    scheduledReminders: [],
    slipAlertEnabled: false,
    tags: [],
    hasSubHabits: false,
    flexibleTarget: null,
    flexibleCompleted: null,
    isLoggedInRange: false,
    instances: [],
    searchMatches: null,
    ...overrides,
  }
}

describe('HabitCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  it('starts drag on long press instead of entering select mode', () => {
    const onLongPressCard = vi.fn()
    const onEnterSelectMode = vi.fn()
    let tree: any

    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <HabitCard
          habit={createMockHabit()}
          actions={{ onLongPressCard, onEnterSelectMode }}
        />,
      )
    })

    const [outerCard] = findOuterCardTouchables(tree.root)

    TestRenderer.act(() => {
      outerCard?.props.onLongPress?.()
    })

    expect(onLongPressCard).toHaveBeenCalledTimes(1)
    expect(onEnterSelectMode).not.toHaveBeenCalled()
  })

  it('opens detail on tap outside select mode', () => {
    const onDetail = vi.fn()
    let tree: any

    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <HabitCard
          habit={createMockHabit()}
          actions={{ onDetail }}
        />,
      )
    })

    const [outerCard] = findOuterCardTouchables(tree.root)

    TestRenderer.act(() => {
      outerCard?.props.onPress?.()
    })

    expect(onDetail).toHaveBeenCalledTimes(1)
  })

  it('toggles selection on tap in select mode', () => {
    const onToggleSelection = vi.fn()
    let tree: any

    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <HabitCard
          habit={createMockHabit()}
          isSelectMode
          actions={{ onToggleSelection }}
        />,
      )
    })

    const [outerCard] = findOuterCardTouchables(tree.root)

    TestRenderer.act(() => {
      outerCard?.props.onPress?.()
    })

    expect(onToggleSelection).toHaveBeenCalledTimes(1)
  })

  it('enters select mode from the actions menu', () => {
    const onEnterSelectMode = vi.fn()
    let tree: any

    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <HabitCard
          habit={createMockHabit()}
          actions={{ onEnterSelectMode }}
        />,
      )
    })

    const menuButton = tree.root.findAll(
      (node: any) =>
        node.type === 'TouchableOpacity' &&
        typeof node.props.onPress === 'function' &&
        node.findAllByType('MoreVertical').length > 0,
    ).at(-1)

    TestRenderer.act(() => {
      menuButton?.props.onPress?.()
    })

    const selectButton = tree.root.findAll(
      (node: any) =>
        node.type === 'TouchableOpacity' &&
        typeof node.props.onPress === 'function' &&
        node.findAllByType('Text').some(
          (textNode: any) => textNode.props.children === 'common.select',
        ),
    )[0]

    TestRenderer.act(() => {
      selectButton?.props.onPress?.()
      vi.runAllTimers()
    })

    expect(onEnterSelectMode).toHaveBeenCalledTimes(1)
  })

  it('does not dim general habits on today view', () => {
    let tree: any

    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <HabitCard
          habit={createMockHabit({ isGeneral: true, isCompleted: false })}
          selectedDate={new Date('2025-01-02')}
        />,
      )
    })

    const [outerCard] = findOuterCardTouchables(tree.root)
    expect(hasDimmedStyle(outerCard?.props.style)).toBe(false)
  })

  it('renders completion feedback on mobile when a habit was just completed', () => {
    let tree: any

    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <HabitCard
          habit={createMockHabit({ isCompleted: false })}
          isRecentlyCompleted
        />,
      )
    })

    expect(
      tree.root.findAll((node: any) => node.props.testID === 'habit-completion-flash').length,
    ).toBeGreaterThanOrEqual(1)
    expect(
      tree.root.findAll((node: any) => node.props.testID === 'habit-completion-spark-0').length,
    ).toBeGreaterThanOrEqual(1)
  })

  it('keeps the parent completion celebration visible while recently completed', () => {
    let tree: any

    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <HabitCard
          habit={createMockHabit({ isCompleted: false, hasSubHabits: true })}
          hasChildren
          childrenDone={3}
          childrenTotal={3}
          isRecentlyCompleted
        />,
      )
    })

    const [outerCard] = findOuterCardTouchables(tree.root)

    expect(hasDimmedStyle(outerCard?.props.style)).toBe(false)
    expect(
      tree.root.findAll((node: any) => node.props.testID === 'habit-parent-complete-center').length,
    ).toBeGreaterThanOrEqual(1)
    expect(
      tree.root.findAll((node: any) => node.props.testID === 'habit-parent-ring-glow').length,
    ).toBeGreaterThanOrEqual(1)
    expect(
      tree.root.findAll((node: any) => node.props.testID === 'habit-parent-ring-pulse').length,
    ).toBeGreaterThanOrEqual(1)
  })

  it('treats the recent parent completion state as completed when tapped', () => {
    const onLog = vi.fn()
    const onUnlog = vi.fn()
    const onForceLogParent = vi.fn()
    let tree: any

    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <HabitCard
          habit={createMockHabit({ isCompleted: false, hasSubHabits: true })}
          hasChildren
          childrenDone={3}
          childrenTotal={3}
          isRecentlyCompleted
          actions={{ onLog, onUnlog, onForceLogParent }}
        />,
      )
    })

    const parentRingButton = tree.root.find(
      (node: any) =>
        node.type === 'TouchableOpacity' &&
        node.props.accessibilityLabel === 'Exercise 3/3',
    )

    TestRenderer.act(() => {
      parentRingButton.props.onPress?.()
    })

    expect(onUnlog).toHaveBeenCalledTimes(1)
    expect(onLog).not.toHaveBeenCalled()
    expect(onForceLogParent).not.toHaveBeenCalled()
  })

  it('does not dim pending drill cards', () => {
    let tree: any

    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <HabitCard
          habit={createMockHabit({
            dueDate: '2025-01-10',
            frequencyUnit: null,
            isCompleted: false,
            isGeneral: false,
          })}
          selectedDate={new Date('2025-01-02')}
          isDrillCard
        />,
      )
    })

    const [outerCard] = findOuterCardTouchables(tree.root)
    expect(hasDimmedStyle(outerCard?.props.style)).toBe(false)
  })

  it('applies status rail styling to sub-habits', () => {
    let tree: any

    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <HabitCard
          habit={createMockHabit({
            isOverdue: true,
            isCompleted: false,
            frequencyUnit: null,
            scheduledDates: [],
          })}
          depth={1}
        />,
      )
    })

    const [outerCard] = findOuterCardTouchables(tree.root)
    expect(hasBorderLeftWidth(outerCard?.props.style, 3)).toBe(true)
  })
})

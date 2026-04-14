import { describe, expect, it, vi, beforeEach } from 'vitest'
import { createMockHabit } from '@orbit/shared/__tests__/factories'
import { HabitCard } from '@/components/habit-card'

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
})

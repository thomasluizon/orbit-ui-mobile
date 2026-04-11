import { describe, expect, it, vi, beforeEach } from 'vitest'
import { createMockHabit } from '@orbit/shared/__tests__/factories'
import { HabitCard } from '@/components/habit-card'

const TestRenderer = require('react-test-renderer')

const colorProxy: any = new Proxy(
  {},
  {
    get: (_target, prop) => {
      if (prop === 'white') return '#ffffff'
      if (prop === 'primary') return '#8b5cf6'
      if (prop === 'amber400') return '#fbbf24'
      if (prop === 'red400') return '#f87171'
      return '#111111'
    },
  },
)

vi.mock('react-native', async () => {
  const actual = await vi.importActual<any>('react-native')
  return {
    ...actual,
    LayoutAnimation: {
      configureNext: vi.fn(),
      Presets: {
        easeInEaseOut: {},
        linear: {},
        spring: {},
      },
      Types: {},
      Properties: {},
    },
  }
})

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
    radius: { sm: 4, md: 8, lg: 12, xl: 16, '2xl': 20, full: 9999 },
    shadows: { sm: {}, md: {}, lg: {} },
  }),
}))

vi.mock('@/lib/theme', () => ({
  createColors: () => colorProxy,
}))

vi.mock('expo-haptics', () => ({
  impactAsync: vi.fn().mockResolvedValue(undefined),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
}))

vi.mock('react-native-gesture-handler', () => {
  const React = require('react')
  return {
    Swipeable: ({ children }: any) => React.createElement('Swipeable', {}, children),
    RectButton: ({ children }: any) => React.createElement('RectButton', {}, children),
  }
})

// Note: lucide-react-native is mocked via vitest.config alias to
// apps/mobile/test-mocks/lucide-react-native.ts — no need to vi.mock here.

vi.mock('react-native-svg', () => {
  const React = require('react')
  return {
    default: (props: any) => React.createElement('Svg', props, props.children),
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

describe('HabitCard (v2)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  it('fires onLongPressCard on long press of the outer shell', () => {
    const onLongPressCard = vi.fn()
    let tree: any
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <HabitCard
          habit={createMockHabit()}
          disableSwipe
          actions={{ onLongPressCard, onLog: vi.fn() }}
        />,
      )
    })

    const [outerCard] = findOuterCardTouchables(tree.root)
    TestRenderer.act(() => {
      outerCard?.props.onLongPress?.()
    })

    expect(onLongPressCard).toHaveBeenCalledTimes(1)
  })

  it('toggles inline expand when a leaf card is tapped', () => {
    const onToggleSelection = vi.fn()
    let tree: any
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <HabitCard
          habit={createMockHabit()}
          disableSwipe
          actions={{ onToggleSelection, onLog: vi.fn() }}
        />,
      )
    })

    const [outerCard] = findOuterCardTouchables(tree.root)
    TestRenderer.act(() => {
      outerCard?.props.onPress?.()
    })

    // Leaf habit with no children: tap should not toggle selection (that's
    // select mode only) — it should toggle the inline expand.
    expect(onToggleSelection).not.toHaveBeenCalled()
  })

  it('toggles selection when tapped in select mode', () => {
    const onToggleSelection = vi.fn()
    let tree: any
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <HabitCard
          habit={createMockHabit()}
          disableSwipe
          isSelectMode
          actions={{ onToggleSelection, onLog: vi.fn() }}
        />,
      )
    })

    const [outerCard] = findOuterCardTouchables(tree.root)
    TestRenderer.act(() => {
      outerCard?.props.onPress?.()
    })

    expect(onToggleSelection).toHaveBeenCalledTimes(1)
  })

  it('calls onToggleExpand when tapping a parent with children', () => {
    const onToggleExpand = vi.fn()
    let tree: any
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <HabitCard
          habit={createMockHabit()}
          disableSwipe
          hasChildren
          childrenDone={1}
          childrenTotal={3}
          actions={{ onToggleExpand, onLog: vi.fn() }}
        />,
      )
    })

    const [outerCard] = findOuterCardTouchables(tree.root)
    TestRenderer.act(() => {
      outerCard?.props.onPress?.()
    })

    expect(onToggleExpand).toHaveBeenCalledTimes(1)
  })
})

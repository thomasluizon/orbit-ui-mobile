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

vi.mock('@/lib/theme', () => ({
  createColors: () => colorProxy,
}))

vi.mock('@/components/ui/anchored-menu', () => ({
  AnchoredMenu: ({ visible, children }: any) => (visible ? children : null),
}))

vi.mock('lucide-react-native', () => {
  const React = require('react')
  const Icon = (props: any) => React.createElement('Icon', props)
  return new Proxy(
    {},
    {
      get: () => Icon,
    },
  )
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

describe('HabitCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  it('starts drag on long press instead of entering select mode', () => {
    const onLongPressCard = vi.fn()
    const onEnterSelectMode = vi.fn()
    const tree = TestRenderer.create(
      <HabitCard
        habit={createMockHabit()}
        onLongPressCard={onLongPressCard}
        onEnterSelectMode={onEnterSelectMode}
      />,
    )

    const [outerCard] = findOuterCardTouchables(tree.root)

    TestRenderer.act(() => {
      outerCard?.props.onLongPress?.()
    })

    expect(onLongPressCard).toHaveBeenCalledTimes(1)
    expect(onEnterSelectMode).not.toHaveBeenCalled()
  })

  it('opens detail on tap outside select mode', () => {
    const onDetail = vi.fn()
    const tree = TestRenderer.create(
      <HabitCard
        habit={createMockHabit()}
        onDetail={onDetail}
      />,
    )

    const [outerCard] = findOuterCardTouchables(tree.root)

    TestRenderer.act(() => {
      outerCard?.props.onPress?.()
    })

    expect(onDetail).toHaveBeenCalledTimes(1)
  })

  it('toggles selection on tap in select mode', () => {
    const onToggleSelection = vi.fn()
    const tree = TestRenderer.create(
      <HabitCard
        habit={createMockHabit()}
        isSelectMode
        onToggleSelection={onToggleSelection}
      />,
    )

    const [outerCard] = findOuterCardTouchables(tree.root)

    TestRenderer.act(() => {
      outerCard?.props.onPress?.()
    })

    expect(onToggleSelection).toHaveBeenCalledTimes(1)
  })

  it('enters select mode from the actions menu', () => {
    const onEnterSelectMode = vi.fn()
    const tree = TestRenderer.create(
      <HabitCard
        habit={createMockHabit()}
        onEnterSelectMode={onEnterSelectMode}
      />,
    )

    const menuButton = tree.root.findAll(
      (node: any) =>
        node.type === 'TouchableOpacity' &&
        typeof node.props.onPress === 'function' &&
        node.findAllByType('Icon').length > 0,
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
})

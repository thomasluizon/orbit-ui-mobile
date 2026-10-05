import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react-test-renderer'
import { formatAPIDate } from '@orbit/shared/utils'
import { GoalLoadError } from '@/components/goals/goal-detail-drawer/goal-load-error'
import { createStyles as createDetailStyles } from '@/components/goals/goal-detail-drawer/styles'
import { GoalProgressHistorySection } from '@/components/goals/goal-detail-sections'
import { GoalDeadlineField } from '@/components/habits/create-goal-from-habit/goal-deadline-field'
import { createStyles as createDeadlineStyles } from '@/components/habits/create-goal-from-habit/styles'
import { expectPressPaint } from '@/__tests__/support/press-feedback'
import { createTokensV2 } from '@/lib/theme'

const state = vi.hoisted((): { reducedMotion: boolean; mode: 'dark' | 'light' } => ({ reducedMotion: false, mode: 'dark' }))
vi.mock('@/lib/motion', () => ({ usePrefersReducedMotion: () => state.reducedMotion }))
vi.mock('@/lib/use-app-theme', () => ({ useAppTheme: () => ({ currentScheme: 'purple', currentTheme: state.mode }) }))

type TestNode = {
  type: unknown
  props: Record<string, unknown>
  findAll: (predicate: (node: TestNode) => boolean) => TestNode[]
  findByType: (type: string) => TestNode
}
type TestTree = { root: TestNode; unmount: () => void }
const renderer = require('react-test-renderer') as { create: (element: React.ReactElement) => TestTree }
const trees: TestTree[] = []

function render(element: React.ReactElement) {
  let tree!: TestTree
  void act(() => { tree = renderer.create(element) })
  trees.push(tree)
  return tree
}

afterEach(() => { void act(() => { trees.splice(0).forEach((tree) => tree.unmount()) }) })

describe('goal control press paint', () => {
  it.each(['dark', 'light'] as const)('retains fill and callbacks with and without reduced motion in %s', (mode) => {
    state.mode = mode
    const tokens = createTokensV2('purple', mode)
    for (const reducedMotion of [false, true]) {
      state.reducedMotion = reducedMotion
      const onRetry = vi.fn()
      const retry = render(<GoalLoadError styles={createDetailStyles(tokens)} onRetry={onRetry} />).root.findByType('Pressable')
      expectPressPaint(retry, { fill: tokens.bgHover, borderRadius: 999, scale: reducedMotion ? null : 0.96 })
      void act(() => { (retry.props.onPress as () => void)() })
      expect(onRetry).toHaveBeenCalledOnce()

      for (const deadline of ['', formatAPIDate(new Date())]) {
        const onChangeDeadline = vi.fn()
        const button = render(<GoalDeadlineField tokens={tokens} styles={createDeadlineStyles(tokens)} deadline={deadline} onChangeDeadline={onChangeDeadline} />).root.findByType('Pressable')
        expectPressPaint(button, { fill: tokens.bgHover, borderRadius: 999, scale: reducedMotion ? 1 : 0.96 })
        void act(() => { (button.props.onPress as () => void)() })
        expect(onChangeDeadline).toHaveBeenCalledWith(deadline ? '' : formatAPIDate(new Date()))
      }

      const history = render(<GoalProgressHistorySection entries={[1, 2, 3, 4].map((value) => ({ createdAtUtc: '2025-06-15T00:00:00Z', previousValue: value - 1, value }))} target={4} unit="books" formatDate={(date) => date} showAllLabel="Show all" showLessLabel="Show less" />)
      const toggle = history.root.findByType('Pressable')
      expectPressPaint(toggle, { fill: tokens.bgHover, borderRadius: 999, scale: reducedMotion ? 1 : 0.96 })
      const historyRows = () => history.root.findAll((node) => node.type === 'Text' && node.props.testID === 'history-progress')
      expect(historyRows()).toHaveLength(3)
      void act(() => { (toggle.props.onPress as () => void)() })
      expect(toggle.props.accessibilityState).toEqual({ expanded: true })
      expect(historyRows()).toHaveLength(4)
      expectPressPaint(toggle, { fill: tokens.bgHover, borderRadius: 999, scale: reducedMotion ? 1 : 0.96 })
      void act(() => { (toggle.props.onPress as () => void)() })
      expect(toggle.props.accessibilityState).toEqual({ expanded: false })
      expect(historyRows()).toHaveLength(3)
    }
  })
})

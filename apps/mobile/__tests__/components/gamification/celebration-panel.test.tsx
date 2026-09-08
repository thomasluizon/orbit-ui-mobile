import { beforeEach, describe, expect, it, vi } from 'vitest'
import { View } from 'react-native'
import { useUIStore } from '@/stores/ui-store'
import { CelebrationPanel } from '@/components/gamification/celebration-panel'
import { Shell412 } from '@/components/shell/shell-412'

const TestRenderer = require('react-test-renderer')
const motion = vi.hoisted(() => ({ reduced: true }))
const selectPlural = vi.hoisted(() => vi.fn((text: string) => `selected:${text}`))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, values?: Record<string, unknown>) => `${key}:${JSON.stringify(values ?? {})}` }),
}))
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 24, left: 0 }),
}))
vi.mock('@/lib/use-app-theme', () => ({
  useAppTheme: () => ({ currentScheme: 'purple', currentTheme: 'dark' }),
}))
vi.mock('@/lib/motion', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/motion')>()),
  usePrefersReducedMotion: () => motion.reduced,
}))
vi.mock('@/lib/plural', () => ({ plural: selectPlural }))

describe('CelebrationPanel mobile', () => {
  beforeEach(() => {
    motion.reduced = true
    selectPlural.mockClear()
    useUIStore.setState({ activeCelebration: null, queuedCelebrations: [] })
  })

  it('keeps the full neutral panel, screen, and composer available when motion is disabled', () => {
    useUIStore.getState().enqueueCelebration('all-done', { count: 1 })
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <Shell412
          notice={<CelebrationPanel />}
          composer={<View testID="astra-composer" />}
          tabBar={<View testID="tab-bar" />}
        >
          <View testID="habit-list" />
        </Shell412>,
      )
    })

    expect(tree!.root.findByProps({ testID: 'celebration-panel' })).toBeTruthy()
    expect(tree!.root.findByProps({ testID: 'celebration-ring' })).toBeTruthy()
    expect(tree!.root.findAllByProps({ testID: 'celebration-ring-travel' })).toHaveLength(0)
    expect(tree!.root.findAllByProps({ accessibilityViewIsModal: true })).toHaveLength(0)
    expect(tree!.root.findByProps({ testID: 'shell-background' }).props.importantForAccessibility).toBe('auto')
    expect(tree!.root.findByProps({ testID: 'shell-scroller' }).findByProps({ testID: 'habit-list' })).toBeTruthy()
    expect(tree!.root.findByProps({ testID: 'shell-pinned-slot' }).findByProps({ testID: 'astra-composer' })).toBeTruthy()
    expect(selectPlural).toHaveBeenCalledWith('celebration.day.line:{"count":1}', 1)
    expect(JSON.stringify(tree!.toJSON())).toContain('selected:celebration.day.line')
  })

  it('renders the goal unit and uses a complete sentence when the unit is empty', () => {
    useUIStore.getState().enqueueCelebration('goal-completed', {
      name: 'Distance',
      count: 5,
      unit: 'km',
    })
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => {
      tree = TestRenderer.create(<CelebrationPanel />)
    })
    expect(JSON.stringify(tree!.toJSON())).toContain(
      'celebration.goal.line:{\\"name\\":\\"Distance\\",\\"count\\":5,\\"unit\\":\\"km\\"}',
    )

    TestRenderer.act(() => {
      useUIStore.setState({ activeCelebration: null, queuedCelebrations: [] })
      useUIStore.getState().enqueueCelebration('goal-completed', {
        name: 'Untitled target',
        count: 1,
        unit: '',
      })
    })
    expect(JSON.stringify(tree!.toJSON())).toContain(
      'celebration.goal.lineWithoutUnit:{\\"name\\":\\"Untitled target\\",\\"count\\":1}',
    )
  })
})

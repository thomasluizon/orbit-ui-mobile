import { beforeEach, describe, expect, it, vi } from 'vitest'
import { View } from 'react-native'
import { useUIStore } from '@/stores/ui-store'
import { CelebrationPanel } from '@/components/gamification/celebration-panel'
import { Shell412 } from '@/components/shell/shell-412'

const TestRenderer = require('react-test-renderer')
const motion = vi.hoisted(() => ({ reduced: true }))

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

describe('CelebrationPanel mobile', () => {
  beforeEach(() => {
    motion.reduced = true
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
    expect(JSON.stringify(tree!.toJSON())).toContain('celebration.day.line')
  })
})

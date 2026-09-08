import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useUIStore } from '@/stores/ui-store'
import { CelebrationPanel } from '@/components/gamification/celebration-panel'

const TestRenderer = require('react-test-renderer')
const motion = vi.hoisted(() => ({ reduced: true }))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, values?: Record<string, unknown>) => `${key}:${JSON.stringify(values ?? {})}` }),
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

  it('keeps the full neutral, non-blocking panel when motion is disabled', () => {
    useUIStore.getState().enqueueCelebration('all-done', { count: 1 })
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => {
      tree = TestRenderer.create(<CelebrationPanel />)
    })

    expect(tree!.root.findByProps({ testID: 'celebration-panel' })).toBeTruthy()
    expect(tree!.root.findByProps({ testID: 'celebration-ring' })).toBeTruthy()
    expect(tree!.root.findAllByProps({ testID: 'celebration-ring-travel' })).toHaveLength(0)
    expect(tree!.root.findAllByProps({ accessibilityViewIsModal: true })).toHaveLength(0)
    expect(JSON.stringify(tree!.toJSON())).toContain('celebration.day.line')
  })
})

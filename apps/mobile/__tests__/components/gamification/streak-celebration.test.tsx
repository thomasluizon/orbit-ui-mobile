import { describe, expect, it, vi } from 'vitest'

import { StreakCelebration } from '@/components/gamification/streak-celebration'

const TestRenderer = require('react-test-renderer')

const storeState = {
  streakCelebration: null as { streak: number } | null,
  setStreakCelebration: vi.fn(),
}

vi.mock('@/stores/ui-store', () => ({
  useUIStore: (selector: (state: typeof storeState) => unknown) => selector(storeState),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${JSON.stringify(params)}` : key,
  }),
}))

vi.mock('@/lib/use-app-theme', () => ({
  useAppTheme: () => ({ currentScheme: 'purple', currentTheme: 'dark' }),
}))

vi.mock('@/lib/theme', () => ({
  createTokensV2: () => ({ bg: '#000', primary: '#7c5cff', fg1: '#fff', fg2: '#ccc', fg3: '#999' }),
  easings: { out: {} },
  tintFromPrimary: () => 'rgba(124, 92, 255, 0.16)',
  zLayers: { celebration: 1500 },
}))

vi.mock('@/lib/motion', () => ({ toAnimatedEasing: () => undefined }))

vi.mock('@/components/ui/gradient-top', () => ({ GradientTop: () => null }))

vi.mock('@/components/gamification/celebration-motion', () => ({
  useCelebrationEntrance: () => ({ orbStyle: {}, titleStyle: {}, subtitleStyle: {} }),
}))

vi.mock('@/components/gamification/ring-motif', () => ({ RingMotif: () => null }))

function collectText(node: unknown): string {
  if (node == null) return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(collectText).join(' ')
  if (typeof node === 'object' && 'children' in (node as Record<string, unknown>)) {
    return collectText((node as { children: unknown }).children)
  }
  return ''
}

function renderCelebration() {
  let tree: { toJSON: () => unknown }
  TestRenderer.act(() => {
    tree = TestRenderer.create(<StreakCelebration />)
  })
  return collectText(tree!.toJSON())
}

describe('StreakCelebration (mobile)', () => {
  it('shows the armed streak when it mounts after the celebration is already set', () => {
    storeState.streakCelebration = { streak: 30 }
    expect(renderCelebration()).toContain('30')
  })

  it('renders nothing when no celebration is armed', () => {
    storeState.streakCelebration = null
    let json: unknown
    TestRenderer.act(() => {
      json = TestRenderer.create(<StreakCelebration />).toJSON()
    })
    expect(json).toBeNull()
  })
})

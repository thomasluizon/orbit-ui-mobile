import React from 'react'
import { View } from 'react-native'
import { act, create } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { measureSafeArea, type GeometryTree } from '@/__tests__/support/safe-area-geometry'
import { testI18n } from '@/__tests__/support/i18n'
import { GoalStatusResultDialog, type GoalStatusOutcome } from '@/components/goals/goal-detail-drawer/goal-status-result-dialog'

const mocks = vi.hoisted(() => ({ language: 'pt-BR' }))
vi.mock('@/lib/use-app-theme', () => ({ useAppTheme: () => ({ currentScheme: 'orange', currentTheme: 'dark' }) }))
vi.mock('react-i18next', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-i18next')>()),
  useTranslation: () => ({ t: testI18n.getFixedT(mocks.language), i18n: { language: mocks.language } }),
}))

const HEIGHT = 780
let tree: GeometryTree | null = null
afterEach(async () => { if (tree) await act(() => tree!.unmount()); tree = null })

describe.each([320, 360, 384, 412])('goal status result dialog at %i px', (width) => {
  describe.each(['pt-BR', 'en'])('in %s', (language) => {
    it.each(['reactivated', 'abandoned', 'deleted'] as GoalStatusOutcome[])('centres the panel after the goal is %s', async (outcome) => {
      mocks.language = language
      await act(() => {
        tree = create(<View style={{ width, height: HEIGHT }}><GoalStatusResultDialog result={{ outcome, title: 'Ler 12 livros', undo: vi.fn() }} onClose={vi.fn()} onOpenList={vi.fn()} /></View>) as GeometryTree
      })
      const boxes = measureSafeArea(tree!.toJSON(), (host) => host.props.testID === 'result-dialog-centre' ? 'free-area' : host.props.testID === 'result-dialog' ? 'block' : undefined, { width, height: HEIGHT })
      const free = boxes.get('free-area')!
      const block = boxes.get('block')!
      expect(Math.abs((block.top + block.bottom) / 2 - (free.top + free.bottom) / 2)).toBeLessThanOrEqual(1)
    })
  })
})

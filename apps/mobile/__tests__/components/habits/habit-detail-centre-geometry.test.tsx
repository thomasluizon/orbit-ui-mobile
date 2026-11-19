import React from 'react'
import { View } from 'react-native'
import { act, create } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { enableTestFlags } from '@orbit/shared/test-support/flag-state'
import { measureSafeArea, type GeometryTree } from '@/__tests__/support/safe-area-geometry'
import { testI18n } from '@/__tests__/support/i18n'
import { HabitDetailLoadError } from '@/components/habits/habit-detail-load-error'
import { HabitDetailResultDialog, type HabitDetailResult } from '@/components/habits/habit-detail-result'

const mocks = vi.hoisted(() => ({ language: 'pt-BR' }))
vi.mock('@/lib/use-app-theme', () => ({ useAppTheme: () => ({ currentScheme: 'orange', currentTheme: 'dark' }) }))
vi.mock('react-i18next', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-i18next')>()),
  useTranslation: () => ({ t: testI18n.getFixedT(mocks.language), i18n: { language: mocks.language } }),
}))

const HEIGHT = 780
let tree: GeometryTree | null = null
afterEach(async () => { if (tree) await act(() => tree!.unmount()); tree = null })

const centreOffset = (block: { top: number; bottom: number }, free: { top: number; bottom: number }) =>
  Math.abs((block.top + block.bottom) / 2 - (free.top + free.bottom) / 2)

describe.each([320, 360, 384, 412])('habit detail centred blocks at %i px', (width) => {
  describe.each(['pt-BR', 'en'])('in %s', (language) => {
    it.each([{ kind: 'rescheduled', date: '20 de novembro' }, { kind: 'deleted' }] as HabitDetailResult[])('centres the result dialog after the habit is $kind', async (result) => {
      mocks.language = language
      await act(() => {
        tree = create(<View style={{ width, height: HEIGHT }}><HabitDetailResultDialog result={result} onSeeToday={vi.fn()} onClose={vi.fn()} /></View>) as GeometryTree
      })
      const boxes = measureSafeArea(tree!.toJSON(), (host) => host.props.testID === 'result-dialog-centre' ? 'free-area' : host.props.testID === 'result-dialog' ? 'block' : undefined, { width, height: HEIGHT })
      expect(centreOffset(boxes.get('block')!, boxes.get('free-area')!)).toBeLessThanOrEqual(1)
    })

    it('centres the full-surface load error with Orbit in Parado', async () => {
      mocks.language = language
      enableTestFlags('orbit_guided_flows')
      const t = testI18n.getFixedT(language)
      await act(() => {
        tree = create(<View style={{ width, height: HEIGHT }}><HabitDetailLoadError message={t('habits.detail.loadError')} retryLabel={t('habits.detail.retry')} onRetry={vi.fn()} /></View>) as GeometryTree
      })
      const boxes = measureSafeArea(tree!.toJSON(), (host) => host.props.testID === 'shell-centred-region' ? 'free-area' : host.props.testID === 'habit-detail-load-error' ? 'block' : undefined, { width, height: HEIGHT })
      const free = boxes.get('free-area')!
      const block = boxes.get('block')!
      expect(free.bottom - free.top).toBeGreaterThan(block.bottom - block.top)
      expect(centreOffset(block, free)).toBeLessThanOrEqual(1)
    })
  })
})

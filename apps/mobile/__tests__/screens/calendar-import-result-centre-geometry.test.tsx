import React from 'react'
import { View } from 'react-native'
import { act, create } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { measureSafeArea, type GeometryTree } from '@/__tests__/support/safe-area-geometry'
import { testI18n } from '@/__tests__/support/i18n'
import { CalendarImportResult } from '@/app/(tabs)/calendar/_components/calendar-import-result'

const mocks = vi.hoisted(() => ({ language: 'pt-BR' }))
vi.mock('expo-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/lib/use-app-theme', () => ({ useAppTheme: () => ({ currentScheme: 'orange', currentTheme: 'dark' }) }))
vi.mock('react-i18next', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-i18next')>()),
  useTranslation: () => ({ t: testI18n.getFixedT(mocks.language), i18n: { language: mocks.language } }),
}))

const HEIGHT = 780
let tree: GeometryTree | null = null
afterEach(async () => { if (tree) await act(() => tree!.unmount()); tree = null })

describe.each([320, 360, 384, 412])('Calendário import result dialog at %i px', (width) => {
  it.each(['pt-BR', 'en'])('centres the panel after an import in %s', async (language) => {
    mocks.language = language
    await act(() => {
      tree = create(<View style={{ width, height: HEIGHT }}><CalendarImportResult count={3} onClose={vi.fn()} /></View>) as GeometryTree
    })
    const boxes = measureSafeArea(tree!.toJSON(), (host) => host.props.testID === 'result-dialog-centre' ? 'free-area' : host.props.testID === 'result-dialog' ? 'block' : undefined, { width, height: HEIGHT })
    const free = boxes.get('free-area')!
    const block = boxes.get('block')!
    expect(Math.abs((block.top + block.bottom) / 2 - (free.top + free.bottom) / 2)).toBeLessThanOrEqual(1)
  })
})

import { afterEach, describe, expect, it, vi } from 'vitest'
import { SearchEmpty } from '@/components/search/search-results'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { measureStartEdgeIconAction } from '@/__tests__/support/start-edge-icon-action'
import { testI18n as i18n } from '@/__tests__/support/i18n'

vi.mock('@/lib/use-app-theme', () => ({ useAppTheme: () => ({ currentScheme: 'orange', currentTheme: 'dark' }) }))
vi.mock('react-i18next', async (importOriginal) => {
  const { testI18n } = await import('@/__tests__/support/i18n')
  const actual = await importOriginal<typeof import('react-i18next')>()
  return { ...actual, Trans: (props: Parameters<typeof actual.Trans>[0]) => actual.Trans({ ...props, i18n: testI18n }), useTranslation: () => ({ t: testI18n.t.bind(testI18n), i18n: testI18n }) }
})

afterEach(async () => { await i18n.changeLanguage('en') })

describe('habit search empty state icon action', () => {
  it.each((['en', 'pt-BR'] as const).flatMap((locale) => (['clear', 'create'] as const).map((action) => ({ locale, action }))))(
    'centres the $action glyph in its paint and starts it on the text column in $locale', async ({ locale, action }) => {
      await i18n.changeLanguage(locale)
      let tree!: ReactTestRenderer & Parameters<typeof measureStartEdgeIconAction>[0]
      await act(() => { tree = create(<SearchEmpty query="indinero" onCreate={vi.fn()} onClearSearch={action === 'clear' ? vi.fn() : undefined} />) as typeof tree })
      try {
        const geometry = measureStartEdgeIconAction(tree, 380, i18n.t(action === 'clear' ? 'common.clear' : 'habits.search.create'))
        const detail = JSON.stringify(geometry)
        expect(geometry.texts.length, detail).toBe(2)
        for (const text of geometry.texts) expect(text.left, detail).toBeCloseTo(geometry.column.left + 12, 3)
        expect(geometry.paint.width, detail).toBe(44)
        expect(geometry.targetWidth, detail).toBe(48)
        expect(Math.abs((geometry.glyph.left + geometry.glyph.right) / 2 - (geometry.paint.left + geometry.paint.right) / 2), detail).toBeLessThanOrEqual(0.5)
        expect(Math.abs((geometry.glyph.top + geometry.glyph.bottom) / 2 - (geometry.paint.top + geometry.paint.bottom) / 2), detail).toBeLessThanOrEqual(0.5)
        expect(Math.abs(geometry.glyph.left - geometry.texts[0]!.left), detail).toBeLessThanOrEqual(0.5)
        expect(geometry.paint.left - (geometry.targetWidth - geometry.paint.width) / 2, detail).toBeGreaterThanOrEqual(geometry.column.left - 2)
      } finally { await act(() => tree.unmount()) }
    })
})

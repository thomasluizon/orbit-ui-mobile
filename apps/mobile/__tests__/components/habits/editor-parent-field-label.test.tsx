import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EditorParentField } from '@/components/habits/editor-parent-field'
import type { useEditorParent } from '@/hooks/use-editor-parent'
import { i18n } from '@/lib/i18n'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string, params?: Record<string, unknown>) => i18n.t(key, params), i18n: { language: i18n.language } }),
}))
vi.mock('@/components/habit-list/move-parent-dialog', () => ({ MoveParentDialog: () => null }))

function parent(value: string): ReturnType<typeof useEditorParent> {
  return {
    open: false, selected: 'parent-1', baseline: null, options: [], state: undefined, value, dirty: false, change: {}, lockedGeneral: null,
    show: () => {}, close: () => {}, select: () => {}, retry: () => Promise.resolve([]), validate: () => null,
  } as unknown as ReturnType<typeof useEditorParent>
}

describe('the parent row of the habit editor', () => {
  let tree: ReactTestRenderer | undefined
  afterEach(async () => { await act(() => tree?.unmount()); tree = undefined })

  it.each([
    ['pt-BR', true, 'Faz parte de, Rotina da manhã'],
    ['pt-BR', false, 'Hábito principal, Rotina da manhã'],
    ['en', true, 'Part of, Rotina da manhã'],
    ['en', false, 'Parent habit, Rotina da manhã'],
  ] as const)('in %s with guided %s names the row in the words of its surface', async (locale, guided, name) => {
    await i18n.changeLanguage(locale)
    await act(() => { tree = create(<EditorParentField parent={parent('Rotina da manhã')} disabled={false} guided={guided} onRetryDetail={() => {}} />) })
    const buttons = tree!.root.findAll((node) => node.props.accessibilityRole === 'button' && typeof node.props.accessibilityLabel === 'string')
    expect(buttons.map((node) => node.props.accessibilityLabel)).toContain(name)
  })
})

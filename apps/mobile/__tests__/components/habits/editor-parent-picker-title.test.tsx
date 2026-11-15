import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { EditorParentField } from '@/components/habits/editor-parent-field'
import { OverlayHost } from '@/components/ui/overlay-host'
import type { useEditorParent } from '@/hooks/use-editor-parent'
import { i18n } from '@/lib/i18n'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string, params?: Record<string, unknown>) => i18n.t(key, params), i18n: { language: i18n.language } }),
}))

function openParent(): ReturnType<typeof useEditorParent> {
  return {
    open: true, selected: null, baseline: null, options: [], state: undefined, value: 'Rotina da manhã', dirty: false, change: {}, lockedGeneral: null,
    show: () => {}, close: () => {}, select: () => {}, retry: () => Promise.resolve([]), validate: () => null,
  } as unknown as ReturnType<typeof useEditorParent>
}

describe('the parent picker of the habit editor', () => {
  let tree: ReactTestRenderer | undefined
  afterEach(async () => { await act(() => tree?.unmount()); tree = undefined })
  const shownTexts = () => tree!.root.findAll((node) => String(node.type) === 'Text').map((node) => node.props.children).filter((value): value is string => typeof value === 'string')

  it.each([
    ['pt-BR', true, ptBR.habits.flow.optional.parentPicker, ptBR.habits.form.parentHabit],
    ['pt-BR', false, ptBR.habits.form.parentHabit, ptBR.habits.flow.optional.parentPicker],
    ['en', true, en.habits.flow.optional.parentPicker, en.habits.form.parentHabit],
    ['en', false, en.habits.form.parentHabit, en.habits.flow.optional.parentPicker],
  ] as const)('in %s with guided %s titles the picker in the words of its surface', async (locale, guided, title, otherTitle) => {
    await i18n.changeLanguage(locale)
    await act(async () => {
      tree = create(<OverlayHost><EditorParentField parent={openParent()} disabled={false} guided={guided} onRetryDetail={() => {}} /></OverlayHost>)
      await Promise.resolve()
    })
    expect(shownTexts()).toContain(title)
    expect(shownTexts()).not.toContain(otherTitle)
  })
})

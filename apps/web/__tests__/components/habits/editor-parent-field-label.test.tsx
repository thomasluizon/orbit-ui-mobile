import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { EditorParentField } from '@/components/habits/editor-parent-field'
import type { useEditorParent } from '@/hooks/use-editor-parent'

const state = vi.hoisted(() => ({ locale: 'pt-BR' as 'en' | 'pt-BR' }))

vi.mock('next-intl', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next-intl')>()
  return { ...actual, useTranslations: () => actual.createTranslator({ locale: state.locale, messages: state.locale === 'en' ? en : ptBR }) }
})
vi.mock('@/components/habits/habit-list/move-parent-overlay', () => ({ MoveParentOverlay: () => null }))

function parent(value: string): ReturnType<typeof useEditorParent> {
  return {
    open: false, selected: 'parent-1', baseline: null, options: [], state: undefined, value, dirty: false, change: {}, lockedGeneral: null,
    show: () => {}, close: () => {}, select: () => {}, retry: () => Promise.resolve([]), validate: () => null,
  } as unknown as ReturnType<typeof useEditorParent>
}

describe('the parent row of the habit editor', () => {
  it.each([
    ['pt-BR', true, 'Faz parte de, Rotina da manhã'],
    ['pt-BR', false, 'Hábito principal, Rotina da manhã'],
    ['en', true, 'Part of, Rotina da manhã'],
    ['en', false, 'Parent habit, Rotina da manhã'],
  ] as const)('in %s with guided %s names the row in the words of its surface', (locale, guided, name) => {
    state.locale = locale
    render(<EditorParentField parent={parent('Rotina da manhã')} disabled={false} guided={guided} onRetryDetail={() => {}} />)
    expect(screen.getByRole('button', { name })).toBeInTheDocument()
  })
})

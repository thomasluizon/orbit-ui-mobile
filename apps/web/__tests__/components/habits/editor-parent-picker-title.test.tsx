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

function openParent(): ReturnType<typeof useEditorParent> {
  return {
    open: true, selected: null, baseline: null, options: [], state: undefined, value: 'Rotina da manhã', dirty: false, change: {}, lockedGeneral: null,
    show: () => {}, close: () => {}, select: () => {}, retry: () => Promise.resolve([]), validate: () => null,
  } as unknown as ReturnType<typeof useEditorParent>
}

describe('the parent picker of the habit editor', () => {
  it.each([
    ['pt-BR', true, ptBR.habits.flow.optional.parentPicker],
    ['pt-BR', false, ptBR.habits.form.parentHabit],
    ['en', true, en.habits.flow.optional.parentPicker],
    ['en', false, en.habits.form.parentHabit],
  ] as const)('in %s with guided %s titles the picker in the words of its surface', async (locale, guided, title) => {
    state.locale = locale
    render(<EditorParentField parent={openParent()} disabled={false} guided={guided} onRetryDetail={() => {}} />)
    expect(await screen.findByRole('dialog', { name: title })).toBeInTheDocument()
  })

  it.each(['pt-BR', 'en'] as const)('asks a question in the guided flow in %s, and never shows the field noun as the title', async (locale) => {
    state.locale = locale
    const copy = locale === 'en' ? en : ptBR
    render(<EditorParentField parent={openParent()} disabled={false} guided onRetryDetail={() => {}} />)
    const picker = await screen.findByRole('dialog')
    expect(picker).toHaveAccessibleName(expect.stringMatching(/\?$/))
    expect(picker).not.toHaveAccessibleName(copy.habits.form.parentHabit)
  })
})

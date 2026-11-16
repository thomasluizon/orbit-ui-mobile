import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TagEditorRow } from '@/components/habits/habit-form-fields/tag-editor-row'

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))

function renderRow(pending: boolean, onCommit = vi.fn()) {
  render(<TagEditorRow value="Health" inputAriaLabel="Tag name" actionLabel="Add" cancelAriaLabel="Cancel" pending={pending} onChange={vi.fn()} onCommit={onCommit} onCancel={vi.fn()} />)
  return { onCommit, action: screen.getByRole('button', { name: 'Add' }) }
}

describe('tag editor action', () => {
  it('keeps its label and shows the skeleton face while the tag request runs, and sends nothing on a second press', () => {
    const { action, onCommit } = renderRow(true)
    expect(action).toHaveAttribute('aria-busy', 'true')
    expect(action).toBeDisabled()
    expect(action).toHaveTextContent('Add')
    expect(action.querySelector('[data-slot="skeleton-face"] .skeleton-pulse')).not.toBeNull()
    fireEvent.click(action)
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Tag name' }), { key: 'Enter' })
    expect(onCommit).not.toHaveBeenCalled()
    expect(screen.getByRole('textbox', { name: 'Tag name' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
  })

  it('rests without the waiting face when no request runs', () => {
    const { action, onCommit } = renderRow(false)
    expect(action).not.toHaveAttribute('aria-busy')
    expect(action.querySelector('[data-slot="skeleton-face"]')).toBeNull()
    fireEvent.click(action)
    expect(onCommit).toHaveBeenCalledOnce()
  })
})

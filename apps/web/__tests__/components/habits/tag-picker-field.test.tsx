import { personalText } from '@/__tests__/support/personal-text'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { HabitTag } from '@orbit/shared/types/habit'
import { TagPickerField } from '@/components/habits/habit-form-fields/tag-picker-field'

vi.mock('next-intl', () => ({ useTranslations: () => (key: string, values?: { name: string }) => key === 'common.showFullText' ? `Show full text: ${values!.name}` : key }))
vi.mock('@/components/ui/sheet', () => ({
  Sheet: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

function buildTags(count: number): HabitTag[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `tag-${index}`,
    name: `Tag ${index}`,
    color: '#6d5bd0',
  }))
}

describe('TagPickerField', () => {
  it('shows an actionable empty state instead of an empty picker body', () => {
    const onCreate = vi.fn()
    render(
      <TagPickerField
        tags={[]}
        selectedIds={[]}
        atLimit={false}
        disabled={false}
        onToggle={vi.fn()}
        onCreate={onCreate}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        editLabel="Edit"
        deleteLabel="Delete"
      />,
    )

    fireEvent.click(screen.getByText('habits.form.tags'))
    expect(screen.getByText('habits.form.noTags')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'habits.form.newTag' }))
    expect(onCreate).toHaveBeenCalledOnce()
  })

  it('keeps a fifty-tag form preview to three chips plus the remainder', () => {
    render(
      <TagPickerField
        tags={buildTags(50)}
        selectedIds={['tag-0', 'tag-1', 'tag-2', 'tag-3']}
        atLimit={false}
        disabled={false}
        onToggle={vi.fn()}
        onCreate={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        editLabel="Edit"
        deleteLabel="Delete"
      />,
    )

    expect(screen.getByText(personalText('Tag 0'))).toBeInTheDocument()
    expect(screen.getByText(personalText('Tag 1'))).toBeInTheDocument()
    expect(screen.getByText(personalText('Tag 2'))).toBeInTheDocument()
    expect(screen.getByText('habits.form.moreSelected')).toBeInTheDocument()
    expect(screen.queryByText(personalText('Tag 3'))).not.toBeInTheDocument()
  })

  it('windows twenty-one or more tags and keeps search outside the scroller', async () => {
    render(
      <TagPickerField
        tags={buildTags(50)}
        selectedIds={[]}
        atLimit={false}
        disabled={false}
        onToggle={vi.fn()}
        onCreate={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        editLabel="Edit"
        deleteLabel="Delete"
      />,
    )
    fireEvent.click(screen.getByText('habits.form.tags'))

    const search = screen.getByPlaceholderText('habits.form.searchTags')
    expect(screen.queryByText(personalText('Tag 20'))).not.toBeInTheDocument()
    fireEvent.scroll(search.nextElementSibling!, { target: { scrollTop: 20 * 120 } })
    expect(await screen.findByText(personalText('Tag 20'))).toBeInTheDocument()
    fireEvent.change(search, { target: { value: 'Tag 49' } })
    expect(screen.getByText(personalText('Tag 49'))).toBeInTheDocument()
    expect(search.nextElementSibling!.scrollTop).toBe(0)
  })

  it('filters tags while keeping a creation action when no tag matches', () => {
    const onCreate = vi.fn()
    render(
      <TagPickerField
        tags={buildTags(25)}
        selectedIds={[]}
        atLimit={false}
        disabled={false}
        onToggle={vi.fn()}
        onCreate={onCreate}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        editLabel="Edit"
        deleteLabel="Delete"
      />,
    )

    fireEvent.click(screen.getByText('habits.form.tags'))
    const search = screen.getByPlaceholderText('habits.form.searchTags')
    fireEvent.change(search, { target: { value: 'Tag 24' } })
    expect(screen.getByText(personalText('Tag 24'))).toBeInTheDocument()
    expect(screen.queryByText(personalText('Tag 0'))).not.toBeInTheDocument()

    fireEvent.change(search, { target: { value: 'No match' } })
    expect(screen.queryByText(personalText('Tag 24'))).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'habits.form.newTag' }))
    expect(onCreate).toHaveBeenCalledOnce()
  })

  it('selects and deselects a tag and exposes its edit and delete actions', () => {
    const tags = buildTags(2)
    const onToggle = vi.fn()
    const onEdit = vi.fn()
    const onDelete = vi.fn()
    const props = {
      tags,
      atLimit: false,
      disabled: false,
      onToggle,
      onCreate: vi.fn(),
      onEdit,
      onDelete,
      editLabel: 'Edit',
      deleteLabel: 'Delete',
    }
    const { rerender } = render(<TagPickerField {...props} selectedIds={[]} />)

    fireEvent.click(screen.getByText('habits.form.tags'))
    let tagButton = screen.getByRole('button', { name: 'Tag 0', pressed: false })
    expect(tagButton).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(tagButton)
    expect(onToggle).toHaveBeenLastCalledWith('tag-0')

    rerender(<TagPickerField {...props} selectedIds={['tag-0']} />)
    tagButton = screen.getByRole('button', { pressed: true })
    expect(tagButton).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(tagButton)
    expect(onToggle).toHaveBeenCalledTimes(2)

    fireEvent.click(screen.getByRole('button', { name: 'Edit: Tag 0' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete: Tag 0' }))
    expect(onEdit).toHaveBeenCalledWith(tags[0])
    expect(onDelete).toHaveBeenCalledWith('tag-0')
  })

  it('renders an editor when an empty tag collection is being created', () => {
    render(
      <TagPickerField
        tags={[]}
        selectedIds={[]}
        atLimit={false}
        disabled={false}
        editor={<div>Tag editor</div>}
        onToggle={vi.fn()}
        onCreate={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        editLabel="Edit"
        deleteLabel="Delete"
      />,
    )

    fireEvent.click(screen.getByText('habits.form.tags'))
    expect(screen.getByText('Tag editor')).toBeInTheDocument()
    expect(screen.queryByText('habits.form.noTags')).not.toBeInTheDocument()
  })
  it.each(['UnbrokenToken' .repeat(24), 'Read extraordinarilyLongWord daily before breakfast with the people in my neighborhood'])('discloses typed text without changing selection for %s', async (name) => {
    const onToggle = vi.fn()
    render(<TagPickerField tags={[{ id: 'long-tag', name, color: '#000000' }]} selectedIds={['long-tag']} atLimit={false} disabled={false} onToggle={onToggle} onCreate={vi.fn()} onEdit={vi.fn()} onDelete={vi.fn()} editLabel="Edit" deleteLabel="Delete" />)
    const disclosure = await screen.findByRole('button', { name, expanded: false })
    fireEvent.click(disclosure)
    expect(screen.getByRole('button', { name, expanded: true })).toBeInTheDocument()
    expect(document.querySelector('[data-personal-text-expanded]')).not.toBeNull()
    expect(onToggle).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name, expanded: true }))
    fireEvent.click(screen.getByRole('button', { name: /habits\.form\.tags/ }))
    const row = await screen.findByRole('button', { name, pressed: true })
    const title = row.querySelector('[data-personal-text]')!
    expect(title).toHaveAttribute('aria-label', name)
    expect(title).toHaveStyle({ whiteSpace: name.includes(' ') ? 'normal' : 'nowrap', wordBreak: 'normal', overflowWrap: 'normal' })
    const fullTextLabel = `Show full text: ${name}`
    const rowDisclosure = screen.getByRole('button', { name: fullTextLabel, expanded: false })
    expect(rowDisclosure).toHaveAccessibleName(fullTextLabel)
    fireEvent.click(rowDisclosure)
    expect(onToggle).not.toHaveBeenCalled()
    fireEvent.click(rowDisclosure)
    fireEvent.click(row)
    expect(onToggle).toHaveBeenCalledWith('long-tag')
  })

})

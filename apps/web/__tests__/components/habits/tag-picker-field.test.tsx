import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { HabitTag } from '@orbit/shared/types/habit'
import { TagPickerField } from '@/components/habits/habit-form-fields/tag-picker-field'

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
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

    expect(screen.getByText('Tag 0')).toBeInTheDocument()
    expect(screen.getByText('Tag 1')).toBeInTheDocument()
    expect(screen.getByText('Tag 2')).toBeInTheDocument()
    expect(screen.getByText('habits.form.moreSelected')).toBeInTheDocument()
    expect(screen.queryByText('Tag 3')).not.toBeInTheDocument()
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
    expect(screen.queryByText('Tag 20')).not.toBeInTheDocument()
    fireEvent.scroll(search.nextElementSibling!, { target: { scrollTop: 20 * 48 } })
    expect(await screen.findByText('Tag 20')).toBeInTheDocument()
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
    expect(screen.getByText('Tag 24')).toBeInTheDocument()
    expect(screen.queryByText('Tag 0')).not.toBeInTheDocument()

    fireEvent.change(search, { target: { value: 'No match' } })
    expect(screen.queryByText('Tag 24')).not.toBeInTheDocument()
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
    let tagButton = screen.getByRole('button', { name: 'Tag 0' })
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
})

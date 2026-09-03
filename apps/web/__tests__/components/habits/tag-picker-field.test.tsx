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
})

import { useRef, useState } from 'react'
import { DndContext, KeyboardSensor, PointerSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext } from '@dnd-kit/sortable'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SortableHabitItem } from '@/components/habits/habit-list/sortable-habit-item'
import { Menu } from '@/components/ui/menu'

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))

function SortableMenu({ presentation }: Readonly<{ presentation: 'sheet' | 'anchored' }>) {
  const anchorRef = useRef<HTMLButtonElement>(null)
  const [selected, setSelected] = useState('')
  const [open, setOpen] = useState(true)
  const menuPresentation = presentation === 'sheet'
    ? { presentation: 'sheet' as const }
    : { presentation: 'anchored' as const, anchorRef }
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 300, tolerance: 5 } }),
    useSensor(KeyboardSensor),
  )
  return (
    <DndContext sensors={sensors}>
      <SortableContext items={['habit-1']}>
        <SortableHabitItem id="habit-1">
          <button type="button" onKeyDown={(event) => {
            if (event.altKey && event.key === 'ArrowDown') setSelected('moved')
          }}>Habit row</button>
          <button type="button" ref={anchorRef}>More</button>
          <Menu open={open} {...menuPresentation} title="Habit actions" onSelect={setSelected} onClose={() => setOpen(false)}
            items={[{ id: 'delete', label: 'Delete', destructive: true }]} />
        </SortableHabitItem>
      </SortableContext>
      <output aria-label="Selected action">{selected}</output>
    </DndContext>
  )
}

describe('Menu inside a sortable habit', () => {
  afterEach(async () => { await new Promise((resolve) => setTimeout(resolve, 60)) })

  it.each(['sheet', 'anchored'] as const)('keeps a %s menu press outside the row drag gesture', async (presentation) => {
    const user = userEvent.setup()
    render(<SortableMenu presentation={presentation} />)
    const remove = await screen.findByRole('menuitem', { name: 'Delete' })
    const row = screen.getByText('Habit row').parentElement!

    await user.pointer([
      { target: remove, keys: '[MouseLeft>]', coords: { x: 100, y: 100 } },
      { target: document.body, coords: { x: 0, y: 0 } },
    ])
    expect(row).toHaveStyle({ opacity: '1' })
    await user.pointer({ keys: '[/MouseLeft]' })
    expect(await screen.findByRole('menu')).toBeVisible()
    expect(screen.getByLabelText('Selected action')).toBeEmptyDOMElement()
    await user.click(remove)
    await waitFor(() => expect(screen.getByLabelText('Selected action')).toHaveTextContent('delete'))
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())

    await user.pointer([
      { target: screen.getByText('Habit row'), keys: '[MouseLeft>]', coords: { x: 100, y: 100 } },
      { target: document.body, coords: { x: 0, y: 0 } },
    ])
    await waitFor(() => expect(row).toHaveStyle({ opacity: '0.5' }))
    await user.pointer({ keys: '[/MouseLeft]' })
    await waitFor(() => expect(row).toHaveStyle({ opacity: '1' }))
  })

  it.each(['sheet', 'anchored'] as const)('keeps %s menu keyboard activation outside the row drag gesture', async (presentation) => {
    render(<SortableMenu presentation={presentation} />)
    const remove = await screen.findByRole('menuitem', { name: 'Delete' })
    const row = screen.getByText('Habit row').parentElement!
    remove.focus()
    fireEvent.keyDown(remove, { key: ' ', code: 'Space' })
    expect(row).toHaveStyle({ opacity: '1' })
    fireEvent.keyUp(remove, { key: ' ', code: 'Space' })
    await userEvent.setup().keyboard(' ')
    await waitFor(() => expect(screen.getByLabelText('Selected action')).toHaveTextContent('delete'))
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
    expect(row).not.toHaveAttribute('role')
    expect(row).not.toHaveAttribute('tabindex')
    const body = screen.getByRole('button', { name: 'Habit row' })
    body.focus()
    await userEvent.setup().keyboard('{Alt>}{ArrowDown}{/Alt}')
    expect(screen.getByLabelText('Selected action')).toHaveTextContent('moved')
    expect(row).toHaveStyle({ opacity: '1' })
  })

  it.each(['sheet', 'anchored'] as const)('keeps a held %s menu touch outside the row drag gesture', async (presentation) => {
    render(<SortableMenu presentation={presentation} />)
    const remove = await screen.findByRole('menuitem', { name: 'Delete' })
    const row = screen.getByText('Habit row').parentElement!
    const touch = { clientX: 100, clientY: 100 }
    fireEvent.touchStart(remove, { touches: [touch] })
    await new Promise((resolve) => setTimeout(resolve, 350))
    expect(row).toHaveStyle({ opacity: '1' })
    fireEvent.touchEnd(remove, { touches: [], changedTouches: [touch] })
    fireEvent.click(remove)
    await waitFor(() => expect(screen.getByLabelText('Selected action')).toHaveTextContent('delete'))
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())

    fireEvent.touchStart(screen.getByText('Habit row'), { touches: [touch] })
    await waitFor(() => expect(row).toHaveStyle({ opacity: '0.5' }))
    fireEvent.touchEnd(screen.getByText('Habit row'), { touches: [], changedTouches: [touch] })
    await waitFor(() => expect(row).toHaveStyle({ opacity: '1' }))
  })
})

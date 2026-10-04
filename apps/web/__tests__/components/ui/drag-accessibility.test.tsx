import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DndContext, MouseSensor, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext } from '@dnd-kit/sortable'
import { NextIntlClientProvider, useTranslations } from 'next-intl'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { createDragAccessibility } from '@/components/ui/drag-accessibility'
import { SortableHabitItem } from '@/components/habits/habit-list/sortable-habit-item'

const items = [{ id: 'first', title: 'Ler' }, { id: 'second', title: 'Caminhar' }]

function DragList() {
  const t = useTranslations()
  const sensors = useSensors(useSensor(MouseSensor, { activationConstraint: { distance: 5 } }))
  return <DndContext sensors={sensors} accessibility={createDragAccessibility(t, (id) => items.find((item) => item.id === id)?.title)}>
    <SortableContext items={items.map((item) => item.id)}>
      {items.map((item) => <SortableHabitItem key={item.id} id={item.id}>{item.title}</SortableHabitItem>)}
    </SortableContext>
  </DndContext>
}

function renderDragList(locale: 'en' | 'pt-BR') {
  render(<NextIntlClientProvider locale={locale} messages={locale === 'en' ? en : ptBR}><DragList /></NextIntlClientProvider>)
  const first = screen.getByRole('button', { name: 'Ler' })
  const second = screen.getByRole('button', { name: 'Caminhar' })
  vi.spyOn(first, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 200, 80))
  vi.spyOn(second, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 100, 200, 80))
  return { first, live: screen.getByRole('status') }
}

async function startDrag(first: HTMLElement, live: HTMLElement, expected: string) {
  expect(live).toBeEmptyDOMElement()
  fireEvent.mouseDown(first, { button: 0, clientX: 0, clientY: 0 })
  fireEvent.mouseMove(document, { clientX: 6, clientY: 0 })
  await waitFor(() => expect(live).toHaveTextContent(expected))
}

async function finishDrag() {
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 50)) })
}

describe.each([
  { locale: 'en' as const, pickedUp: 'Ler picked up to move.', movedOver: 'Ler moved over Caminhar.', droppedOver: 'Ler dropped over Caminhar.', movedOutside: 'Ler is outside a drop area.', dropped: 'Ler dropped.', cancelled: 'Moving Ler cancelled.' },
  { locale: 'pt-BR' as const, pickedUp: 'Ler selecionado para mover.', movedOver: 'Ler movido sobre Caminhar.', droppedOver: 'Ler solto sobre Caminhar.', movedOutside: 'Ler está fora de uma área para soltar.', dropped: 'Ler solto.', cancelled: 'Movimento de Ler cancelado.' },
])('drag announcements in $locale', (copy) => {
  it('names both items when moving over and dropping on a target', async () => {
    const { first, live } = renderDragList(copy.locale)
    await startDrag(first, live, copy.pickedUp)
    fireEvent.mouseMove(document, { clientX: 6, clientY: 100 })
    await waitFor(() => expect(live).toHaveTextContent(copy.movedOver))
    fireEvent.mouseUp(document)
    await waitFor(() => expect(live).toHaveTextContent(copy.droppedOver))
    await finishDrag()
  })

  it('names the item when leaving all targets and dropping outside', async () => {
    const { first, live } = renderDragList(copy.locale)
    await startDrag(first, live, copy.pickedUp)
    fireEvent.mouseMove(document, { clientX: 6, clientY: 400 })
    await waitFor(() => expect(live).toHaveTextContent(copy.movedOutside))
    fireEvent.mouseUp(document)
    await waitFor(() => expect(live).toHaveTextContent(copy.dropped))
    await finishDrag()
  })

  it('names the item when cancelling the drag', async () => {
    const { first, live } = renderDragList(copy.locale)
    await startDrag(first, live, copy.pickedUp)
    fireEvent.keyDown(document, { code: 'Escape' })
    await waitFor(() => expect(live).toHaveTextContent(copy.cancelled))
    await finishDrag()
  })
})

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DndContext, MouseSensor, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, useSortable } from '@dnd-kit/sortable'
import { NextIntlClientProvider, useTranslations } from 'next-intl'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { useDragAccessibility } from '@/components/ui/drag-accessibility'

const items = [{ id: 'first', title: 'Ler' }, { id: 'second', title: 'Caminhar' }]

function SortableAnnouncementItem({ id, title }: Readonly<{ id: string; title: string }>) {
  const { attributes, listeners, setNodeRef } = useSortable({ id, attributes: { roleDescription: useTranslations()('dragAndDrop.roleDescription') } })
  return <button type="button" ref={setNodeRef} {...attributes} {...listeners}>{title}</button>
}

function DragList() {
  const t = useTranslations()
  const sensors = useSensors(useSensor(MouseSensor, { activationConstraint: { distance: 5 } }))
  const accessibility = useDragAccessibility(t, (id) => items.find((item) => item.id === id)?.title)
  return <DndContext sensors={sensors} accessibility={accessibility}>
    <SortableContext items={items.map((item) => item.id)}>
      {items.map((item) => <SortableAnnouncementItem key={item.id} {...item} />)}
    </SortableContext>
  </DndContext>
}

function renderDragList(locale: 'en' | 'pt-BR') {
  const rendered = render(<NextIntlClientProvider locale={locale} messages={locale === 'en' ? en : ptBR}><DragList /></NextIntlClientProvider>)
  const first = screen.getByRole('button', { name: 'Ler' })
  const second = screen.getByRole('button', { name: 'Caminhar' })
  vi.spyOn(first, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 200, 80))
  vi.spyOn(second, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 100, 200, 80))
  return { first, live: screen.getByRole('status'), rerender: () => rendered.rerender(<NextIntlClientProvider locale={locale} messages={locale === 'en' ? en : ptBR}><DragList /></NextIntlClientProvider>) }
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
  { locale: 'en' as const, returned: 'Ler is back in its starting position.', droppedInPlace: 'Ler dropped in its starting position.', pickedUp: 'Ler picked up to move.', movedOver: 'Ler moved over Caminhar.', droppedOver: 'Ler dropped over Caminhar.', movedOutside: 'Ler is outside a drop area.', dropped: 'Ler dropped.', cancelled: 'Moving Ler cancelled.' },
  { locale: 'pt-BR' as const, returned: 'Ler voltou para a posição inicial.', droppedInPlace: 'Ler solto na posição inicial.', pickedUp: 'Ler selecionado para mover.', movedOver: 'Ler movido sobre Caminhar.', droppedOver: 'Ler solto sobre Caminhar.', movedOutside: 'Ler está fora de uma área para soltar.', dropped: 'Ler solto.', cancelled: 'Movimento de Ler cancelado.' },
])('drag announcements in $locale', (copy) => {
  it('links every sortable item to localized instructions and describes its role', () => {
    renderDragList(copy.locale)
    const catalog = copy.locale === 'en' ? en : ptBR
    for (const item of items) {
      const sortable = screen.getByRole('button', { name: item.title })
      expect(sortable).toHaveAttribute('aria-roledescription', catalog.dragAndDrop.roleDescription)
      expect(document.getElementById(sortable.getAttribute('aria-describedby')!)).toHaveTextContent(catalog.dragAndDrop.instructions)
    }
  })

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

  it.each(['another item', 'outside'])('announces a return from %s across a render and a drop that keeps the order', async (destination) => {
    const { first, live, rerender } = renderDragList(copy.locale)
    await startDrag(first, live, copy.pickedUp)
    fireEvent.mouseMove(document, { clientX: 6, clientY: destination === 'outside' ? 400 : 100 })
    const previous = destination === 'outside' ? copy.movedOutside : copy.movedOver
    await waitFor(() => expect(live).toHaveTextContent(previous))
    rerender()
    fireEvent.mouseMove(document, { clientX: 6, clientY: 0 })
    await waitFor(() => expect(live).toHaveTextContent(copy.returned))
    expect(live).not.toHaveTextContent(previous)
    fireEvent.mouseUp(document)
    await waitFor(() => expect(live).toHaveTextContent(copy.droppedInPlace))
    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual(['Ler', 'Caminhar'])
    await finishDrag()
    fireEvent.mouseDown(first, { button: 0, clientX: 0, clientY: 0 })
    fireEvent.mouseMove(document, { clientX: 6, clientY: 0 })
    await waitFor(() => expect(live).toHaveTextContent(copy.pickedUp))
    fireEvent.keyDown(document, { code: 'Escape' })
    await waitFor(() => expect(live).toHaveTextContent(copy.cancelled))
    await finishDrag()
  })

  it('drops in place without announcing a return when the item never left', async () => {
    const { first, live } = renderDragList(copy.locale)
    await startDrag(first, live, copy.pickedUp)
    fireEvent.mouseMove(document, { clientX: 7, clientY: 0 })
    expect(live).toHaveTextContent(copy.pickedUp)
    fireEvent.mouseUp(document)
    await waitFor(() => expect(live).toHaveTextContent(copy.droppedInPlace))
    await finishDrag()
  })

  it('resets the starting position after cancelling a drag that left it', async () => {
    const { first, live } = renderDragList(copy.locale)
    await startDrag(first, live, copy.pickedUp)
    fireEvent.mouseMove(document, { clientX: 6, clientY: 100 })
    await waitFor(() => expect(live).toHaveTextContent(copy.movedOver))
    fireEvent.keyDown(document, { code: 'Escape' })
    await waitFor(() => expect(live).toHaveTextContent(copy.cancelled))
    await finishDrag()
    fireEvent.mouseDown(first, { button: 0, clientX: 0, clientY: 0 })
    fireEvent.mouseMove(document, { clientX: 6, clientY: 0 })
    await waitFor(() => expect(live).toHaveTextContent(copy.pickedUp))
    fireEvent.mouseUp(document)
    await waitFor(() => expect(live).toHaveTextContent(copy.droppedInPlace))
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

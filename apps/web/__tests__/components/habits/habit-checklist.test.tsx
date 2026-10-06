import { personalText } from '@/__tests__/support/personal-text'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import React from 'react'
import { createTranslator } from 'next-intl'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { HabitChecklist } from '@/components/habits/habit-checklist'
import type { ChecklistItem } from '@orbit/shared/types/habit'
import { MAX_CHECKLIST_ITEMS } from '@orbit/shared/validation'


const locale = vi.hoisted(() => ({ portuguese: false, english: false }))

vi.mock('next-intl', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next-intl')>()),
  useTranslations: () => {
    if (locale.english) return createTranslator({ locale: 'en', messages: en })
    if (locale.portuguese) return createTranslator({ locale: 'pt-BR', messages: ptBR })
    const t = (key: string, params?: Record<string, unknown>) => {
      if (params && Object.keys(params).length > 0) {
        return `${key}(${JSON.stringify(params)})`
      }
      return key
    }
    return t
  },
}))


function makeItems(overrides?: Partial<ChecklistItem>[]): ChecklistItem[] {
  const defaults: ChecklistItem[] = [
    { text: 'Step 1', isChecked: false },
    { text: 'Step 2', isChecked: true },
    { text: 'Step 3', isChecked: false },
  ]
  if (!overrides) return defaults
  return overrides.map((o, i) => ({ ...defaults[i % defaults.length]!, ...o }) as ChecklistItem)
}


describe('HabitChecklist', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    locale.portuguese = false
    locale.english = false
  })

  describe('rendering', () => {
    it('renders without crashing with empty items', () => {
      render(<HabitChecklist items={[]} />)
      expect(screen.queryByRole('progressbar')).toBeNull()
    })

    it('renders all checklist item texts', () => {
      const items = makeItems()
      render(<HabitChecklist items={items} />)
      expect(screen.getByText(personalText('Step 1'))).toBeDefined()
      expect(screen.getByText(personalText('Step 2'))).toBeDefined()
      expect(screen.getByText(personalText('Step 3'))).toBeDefined()
    })
  })

  describe('interactive mode', () => {
    it('renders checkboxes in interactive mode', () => {
      const items = makeItems()
      render(<HabitChecklist items={items} interactive />)
      const checkboxes = screen.getAllByRole('checkbox')
      expect(checkboxes).toHaveLength(3)
    })

    it('shows checklist progress on the normalized shared scale', () => {
      const items = makeItems()
      render(<HabitChecklist items={items} interactive />)
      const progressbar = screen.getByRole('progressbar')
      expect(progressbar).toBeDefined()
      expect(progressbar.getAttribute('aria-valuenow')).toBe(String(1 / 3))
      expect(progressbar.getAttribute('aria-valuemax')).toBe('1')
    })

    it('shows progress counter text', () => {
      const items = makeItems()
      render(<HabitChecklist items={items} interactive />)
      expect(screen.getByText('1/3')).toBeDefined()
    })

    it('calls onToggle when checkbox is clicked', () => {
      const onToggle = vi.fn()
      const items = makeItems()
      render(<HabitChecklist items={items} interactive onToggle={onToggle} />)
      const checkboxes = screen.getAllByRole('checkbox')
      fireEvent.click(checkboxes[0]!)
      expect(onToggle).toHaveBeenCalledWith(0)
    })

    it('discloses the full label without changing its checked state', () => {
      const onToggle = vi.fn()
      const items = makeItems()
      render(<HabitChecklist items={items} interactive onToggle={onToggle} />)
      fireEvent.click(screen.getByRole('button', { name: 'Step 3' }))
      expect(screen.getByRole('button', { name: 'Step 3' })).toHaveAttribute('aria-expanded', 'true')
      expect(onToggle).not.toHaveBeenCalled()
    })

    it('shows reset button when at least one item is checked', () => {
      const items = makeItems()
      render(<HabitChecklist items={items} interactive />)
      expect(screen.getByLabelText('habits.form.resetChecklist')).toBeDefined()
    })

    it('calls onReset when reset button is clicked', () => {
      const onReset = vi.fn()
      const items = makeItems()
      render(<HabitChecklist items={items} interactive onReset={onReset} />)
      fireEvent.click(screen.getByLabelText('habits.form.resetChecklist'))
      expect(onReset).toHaveBeenCalledOnce()
    })

    it('shows clear button in interactive mode', () => {
      const items = makeItems()
      render(<HabitChecklist items={items} interactive />)
      expect(screen.getByLabelText('habits.form.clearChecklist')).toBeDefined()
    })

    it('calls onClear when clear button is clicked', () => {
      const onClear = vi.fn()
      const items = makeItems()
      render(<HabitChecklist items={items} interactive onClear={onClear} />)
      fireEvent.click(screen.getByLabelText('habits.form.clearChecklist'))
      expect(onClear).toHaveBeenCalledOnce()
    })

    it('does not show reset when no items are checked', () => {
      const items = [
        { text: 'A', isChecked: false },
        { text: 'B', isChecked: false },
      ]
      render(<HabitChecklist items={items} interactive />)
      expect(screen.queryByLabelText('habits.form.resetChecklist')).toBeNull()
    })

    it('dims checked items without striking their labels', () => {
      const items = [{ text: 'Done task', isChecked: true }]
      render(<HabitChecklist items={items} interactive />)
      const span = screen.getByText(personalText('Done task'))
      expect(span).toHaveStyle({ color: 'var(--fg-3)' })
      expect(span.className).not.toContain('line-through')
    })

    it('shows complete progress when all items are checked', () => {
      const items = [
        { text: 'A', isChecked: true },
        { text: 'B', isChecked: true },
      ]
      render(<HabitChecklist items={items} interactive />)
      const progressbar = screen.getByRole('progressbar')
      expect(progressbar.getAttribute('aria-valuenow')).toBe('1')
      expect(progressbar).toHaveAttribute('data-complete', 'true')
    })
  })

  describe('editable mode', () => {
    it('localizes the editable drag instructions in Portuguese', () => {
      locale.portuguese = true
      render(<HabitChecklist items={[{ text: 'Preparar café', isChecked: false }]} editable />)
      const row = screen.getByRole('button', { name: 'Mover Preparar café' })
      expect(document.getElementById(row.getAttribute('aria-describedby')!)?.textContent).toContain('barra de espaço')
      expect(document.getElementById(row.getAttribute('aria-describedby')!)?.textContent).not.toContain('To pick up')
    })

    it('localizes each editable sortable role in Portuguese', () => {
      locale.portuguese = true
      const { container } = render(<HabitChecklist items={makeItems()} editable />)
      const sortables = container.querySelectorAll('[aria-roledescription]')
      expect(sortables).toHaveLength(3)
      for (const sortable of sortables) expect(sortable).toHaveAttribute('aria-roledescription', 'item reordenável')
    })

    it('names the checklist item in a Portuguese keyboard drag announcement', async () => {
      locale.portuguese = true
      const { container } = render(<HabitChecklist items={[{ text: 'Preparar café', isChecked: false }]} editable />)
      const sortable = container.querySelector<HTMLElement>('[aria-roledescription]')!
      sortable.focus()
      fireEvent.keyDown(sortable, { key: ' ', code: 'Space' })
      await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Preparar café selecionado para mover.'))
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) })
      fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' })
      await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Movimento de Preparar café cancelado.'))
    })


    it.each(['en', 'pt-BR'])('announces a keyboard return and unchanged drop in %s after an owner render', async (language) => {
      locale.portuguese = language === 'pt-BR'
      locale.english = language === 'en'
      const name = 'Preparar café'
      const target = 'Lavar a xícara'
      const items = [{ text: name, isChecked: false }, { text: target, isChecked: false }]
      const onItemsChange = vi.fn()
      const { container, rerender } = render(<HabitChecklist items={items} editable onItemsChange={onItemsChange} />)
      const rows = container.querySelectorAll<HTMLElement>('[aria-roledescription]')
      vi.spyOn(rows[0]!.parentElement!, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 200, 80))
      vi.spyOn(rows[1]!.parentElement!, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 100, 200, 80))
      const live = screen.getByRole('status')
      rows[0]!.focus()
      fireEvent.keyDown(rows[0]!, { key: ' ', code: 'Space' })
      await waitFor(() => expect(live).toHaveTextContent(language === 'pt-BR' ? `${name} selecionado para mover.` : `${name} picked up to move.`))
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) })
      fireEvent.keyDown(document, { code: 'ArrowDown' })
      const previous = language === 'pt-BR' ? `${name} movido sobre ${target}.` : `${name} moved over ${target}.`
      await waitFor(() => expect(live).toHaveTextContent(previous))
      rerender(<HabitChecklist items={items} editable proposedItemCount={1} onItemsChange={onItemsChange} />)
      fireEvent.keyDown(document, { code: 'ArrowUp' })
      await waitFor(() => expect(live).toHaveTextContent(language === 'pt-BR' ? `${name} voltou para a posição inicial.` : `${name} is back in its starting position.`))
      expect(live).not.toHaveTextContent(previous)
      fireEvent.keyDown(document, { code: 'Space' })
      await waitFor(() => expect(live).toHaveTextContent(language === 'pt-BR' ? `${name} solto na posição inicial.` : `${name} dropped in its starting position.`))
      expect(onItemsChange).not.toHaveBeenCalled()
      expect(screen.getAllByRole('textbox').map((input) => (input as HTMLInputElement).value).slice(0, 2)).toEqual([name, target])
    })

    it('keeps each row mounted through an optimistic reorder and its rollback', () => {
      const original = makeItems().slice(0, 2)
      function ChecklistHarness() {
        const [items, setItems] = React.useState(original)
        return <>
          <button onClick={() => setItems([original[1]!, original[0]!])}>Move</button>
          <button onClick={() => setItems(original)}>Reject</button>
          <HabitChecklist items={items} editable onItemsChange={setItems} />
        </>
      }

      render(<ChecklistHarness />)
      const firstInput = screen.getByDisplayValue('Step 1')
      const secondInput = screen.getByDisplayValue('Step 2')
      secondInput.focus()
      fireEvent.click(screen.getByText('Move'))
      expect(screen.getByDisplayValue('Step 2')).toBe(secondInput)
      expect(document.activeElement).toBe(secondInput)
      fireEvent.click(screen.getByText('Reject'))
      expect(screen.getByDisplayValue('Step 1')).toBe(firstInput)
      expect(screen.getByDisplayValue('Step 2')).toBe(secondInput)
      expect(document.activeElement).toBe(secondInput)
    })

    it('restores row identity after a rejected positional removal', () => {
      const original = makeItems().slice(0, 2)
      function ChecklistHarness() {
        const [items, setItems] = React.useState(original)
        return <>
          <button onClick={() => setItems(original)}>Reject</button>
          <HabitChecklist items={items} editable onItemsChange={setItems} />
        </>
      }

      render(<ChecklistHarness />)
      const secondInput = screen.getByDisplayValue('Step 2')
      secondInput.focus()
      fireEvent.click(screen.getAllByLabelText('habits.form.removeChecklistItem')[0]!)
      expect(screen.getByDisplayValue('Step 2')).toBe(secondInput)
      fireEvent.click(screen.getByText('Reject'))
      expect(screen.getByDisplayValue('Step 2')).toBe(secondInput)
      expect(document.activeElement).toBe(secondInput)
    })

    it('keeps focus on the same row when an earlier item is removed', () => {
      function ChecklistHarness() {
        const [items, setItems] = React.useState<ChecklistItem[]>([
          { text: 'First item', isChecked: false },
          { text: 'Second item', isChecked: false },
        ])
        return <HabitChecklist items={items} editable onItemsChange={setItems} />
      }

      render(<ChecklistHarness />)
      const secondInput = screen.getByDisplayValue('Second item')
      secondInput.focus()
      fireEvent.click(screen.getAllByLabelText('habits.form.removeChecklistItem')[0]!)

      expect(screen.getByDisplayValue('Second item')).toBe(secondInput)
      expect(document.activeElement).toBe(secondInput)
    })

    it('renders input fields for each item in editable mode', () => {
      const items = makeItems()
      render(<HabitChecklist items={items} editable />)
      const inputs = screen.getAllByRole('textbox')
      expect(inputs).toHaveLength(4)
    })

    it('renders the add item input', () => {
      render(<HabitChecklist items={[]} editable />)
      expect(screen.getByPlaceholderText('habits.form.checklistPlaceholder')).toBeDefined()
    })

    it('calls onItemsChange when typing in an item', () => {
      const onItemsChange = vi.fn()
      const items = [{ text: 'Original', isChecked: false }]
      render(<HabitChecklist items={items} editable onItemsChange={onItemsChange} />)
      const input = screen.getByDisplayValue('Original')
      fireEvent.change(input, { target: { value: 'Updated' } })
      expect(onItemsChange).toHaveBeenCalledWith([{ text: 'Updated', isChecked: false }])
    })

    it('adds a new item on add button click', () => {
      const onItemsChange = vi.fn()
      render(<HabitChecklist items={[]} editable onItemsChange={onItemsChange} />)
      const input = screen.getByPlaceholderText('habits.form.checklistPlaceholder')
      fireEvent.change(input, { target: { value: 'New item' } })
      const addButton = screen.getByLabelText('common.add')
      fireEvent.click(addButton)
      expect(onItemsChange).toHaveBeenCalledWith([{ text: 'New item', isChecked: false }])
    })

    it('adds a new item on Enter key', () => {
      const onItemsChange = vi.fn()
      render(<HabitChecklist items={[]} editable onItemsChange={onItemsChange} />)
      const input = screen.getByPlaceholderText('habits.form.checklistPlaceholder')
      fireEvent.change(input, { target: { value: 'New item' } })
      fireEvent.keyDown(input, { key: 'Enter' })
      expect(onItemsChange).toHaveBeenCalledWith([{ text: 'New item', isChecked: false }])
    })

    it('disables add button when new item text is empty', () => {
      render(<HabitChecklist items={[]} editable />)
      const addButton = screen.getByLabelText('common.add')
      expect(addButton.hasAttribute('disabled')).toBe(true)
    })

    it('does not add item with only whitespace', () => {
      const onItemsChange = vi.fn()
      render(<HabitChecklist items={[]} editable onItemsChange={onItemsChange} />)
      const input = screen.getByPlaceholderText('habits.form.checklistPlaceholder')
      fireEvent.change(input, { target: { value: '   ' } })
      const addButton = screen.getByLabelText('common.add')
      fireEvent.click(addButton)
      expect(onItemsChange).not.toHaveBeenCalled()
    })

    it('removes an item on delete click', () => {
      const onItemsChange = vi.fn()
      const items = [
        { text: 'Keep', isChecked: false },
        { text: 'Remove', isChecked: false },
      ]
      render(<HabitChecklist items={items} editable onItemsChange={onItemsChange} />)
      const removeButtons = screen.getAllByLabelText('habits.form.removeChecklistItem')
      fireEvent.click(removeButtons[1]!)
      expect(onItemsChange).toHaveBeenCalledWith([{ text: 'Keep', isChecked: false }])
    })

    it('duplicates an item on duplicate click', () => {
      const onItemsChange = vi.fn()
      const items = [{ text: 'Original', isChecked: true }]
      render(<HabitChecklist items={items} editable onItemsChange={onItemsChange} />)
      const dupButton = screen.getByLabelText('habits.form.duplicateChecklistItem')
      fireEvent.click(dupButton)
      expect(onItemsChange).toHaveBeenCalledWith([
        { text: 'Original', isChecked: true },
        { text: 'Original', isChecked: false },
      ])
    })

    it('shows clear all button when there are items', () => {
      const items = [{ text: 'Something', isChecked: false }]
      render(<HabitChecklist items={items} editable />)
      expect(screen.getByText('habits.form.clearChecklist')).toBeDefined()
    })

    it('clears all items on clear click', () => {
      const onItemsChange = vi.fn()
      const items = [
        { text: 'A', isChecked: false },
        { text: 'B', isChecked: true },
      ]
      render(<HabitChecklist items={items} editable onItemsChange={onItemsChange} />)
      fireEvent.click(screen.getByText('habits.form.clearChecklist'))
      expect(onItemsChange).toHaveBeenCalledWith([])
    })

    it('does not show progress bar in editable mode', () => {
      const items = makeItems()
      render(<HabitChecklist items={items} editable />)
      expect(screen.queryByRole('progressbar')).toBeNull()
    })

    it('states and enforces the fifty item ceiling', () => {
      const onItemsChange = vi.fn()
      const items = Array.from({ length: MAX_CHECKLIST_ITEMS }, (_, index) => ({
        text: `Step ${index + 1}`,
        isChecked: false,
      }))

      render(<HabitChecklist items={items} editable onItemsChange={onItemsChange} />)

      expect(screen.getByText('habits.form.checklistItemLimit')).toBeDefined()
      expect(screen.getByPlaceholderText('habits.form.checklistPlaceholder')).toBeDisabled()
      expect(screen.getByLabelText('common.add')).toBeDisabled()
      expect(screen.getAllByLabelText('habits.form.duplicateChecklistItem')[0]).toBeDisabled()
      expect(onItemsChange).not.toHaveBeenCalled()
    })
  })
})

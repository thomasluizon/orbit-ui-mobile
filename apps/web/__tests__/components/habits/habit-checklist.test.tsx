import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import { HabitChecklist } from '@/components/habits/habit-checklist'
import type { ChecklistItem } from '@orbit/shared/types/habit'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('next-intl', () => ({
  useTranslations: () => {
    const t = (key: string, params?: Record<string, unknown>) => {
      if (params && Object.keys(params).length > 0) {
        return `${key}(${JSON.stringify(params)})`
      }
      return key
    }
    return t
  },
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeItems(overrides?: Partial<ChecklistItem>[]): ChecklistItem[] {
  const defaults: ChecklistItem[] = [
    { text: 'Step 1', isChecked: false },
    { text: 'Step 2', isChecked: true },
    { text: 'Step 3', isChecked: false },
  ]
  if (!overrides) return defaults
  return overrides.map((o, i) => ({ ...defaults[i % defaults.length]!, ...o }) as ChecklistItem)
}

// ---------------------------------------------------------------------------
// Tests: Rendering
// ---------------------------------------------------------------------------

describe('HabitChecklist', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('rendering', () => {
    it('renders without crashing with empty items', () => {
      render(<HabitChecklist items={[]} />)
      // Should not crash; nothing visible
      expect(screen.queryByRole('progressbar')).toBeNull()
    })

    it('renders all checklist item texts', () => {
      const items = makeItems()
      render(<HabitChecklist items={items} />)
      expect(screen.getByText('Step 1')).toBeDefined()
      expect(screen.getByText('Step 2')).toBeDefined()
      expect(screen.getByText('Step 3')).toBeDefined()
    })
  })

  describe('interactive mode', () => {
    it('renders checkboxes in interactive mode', () => {
      const items = makeItems()
      render(<HabitChecklist items={items} interactive />)
      const checkboxes = screen.getAllByRole('checkbox')
      expect(checkboxes).toHaveLength(3)
    })

    it('shows progress bar with correct counts', () => {
      const items = makeItems()
      render(<HabitChecklist items={items} interactive />)
      const progressbar = screen.getByRole('progressbar')
      expect(progressbar).toBeDefined()
      expect(progressbar.getAttribute('value')).toBe('33')
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

    it('shows reset button when at least one item is checked', () => {
      const items = makeItems()
      render(<HabitChecklist items={items} interactive />)
      expect(screen.getByText('habits.form.resetChecklist')).toBeDefined()
    })

    it('calls onReset when reset button is clicked', () => {
      const onReset = vi.fn()
      const items = makeItems()
      render(<HabitChecklist items={items} interactive onReset={onReset} />)
      fireEvent.click(screen.getByText('habits.form.resetChecklist'))
      expect(onReset).toHaveBeenCalledOnce()
    })

    it('shows clear button in interactive mode', () => {
      const items = makeItems()
      render(<HabitChecklist items={items} interactive />)
      expect(screen.getByText('habits.form.clearChecklist')).toBeDefined()
    })

    it('calls onClear when clear button is clicked', () => {
      const onClear = vi.fn()
      const items = makeItems()
      render(<HabitChecklist items={items} interactive onClear={onClear} />)
      fireEvent.click(screen.getByText('habits.form.clearChecklist'))
      expect(onClear).toHaveBeenCalledOnce()
    })

    it('does not show reset when no items are checked', () => {
      const items = [
        { text: 'A', isChecked: false },
        { text: 'B', isChecked: false },
      ]
      render(<HabitChecklist items={items} interactive />)
      expect(screen.queryByText('habits.form.resetChecklist')).toBeNull()
    })

    it('shows line-through for checked items', () => {
      const items = [{ text: 'Done task', isChecked: true }]
      render(<HabitChecklist items={items} interactive />)
      const span = screen.getByText('Done task')
      expect(span.className).toContain('line-through')
    })

    it('shows 100% progress when all items are checked', () => {
      const items = [
        { text: 'A', isChecked: true },
        { text: 'B', isChecked: true },
      ]
      render(<HabitChecklist items={items} interactive />)
      const progressbar = screen.getByRole('progressbar')
      expect(progressbar.getAttribute('value')).toBe('100')
    })
  })

  describe('editable mode', () => {
    it('renders input fields for each item in editable mode', () => {
      const items = makeItems()
      render(<HabitChecklist items={items} editable />)
      const inputs = screen.getAllByRole('textbox')
      // 3 items + 1 new item input
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
      const addButton = screen.getByText('common.add')
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
      const addButton = screen.getByText('common.add')
      expect(addButton.hasAttribute('disabled')).toBe(true)
    })

    it('does not add item with only whitespace', () => {
      const onItemsChange = vi.fn()
      render(<HabitChecklist items={[]} editable onItemsChange={onItemsChange} />)
      const input = screen.getByPlaceholderText('habits.form.checklistPlaceholder')
      fireEvent.change(input, { target: { value: '   ' } })
      const addButton = screen.getByText('common.add')
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
  })
})

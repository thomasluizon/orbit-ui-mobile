import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

// Mock crypto.randomUUID
vi.stubGlobal('crypto', { randomUUID: () => 'test-uuid-123' })

import { ChecklistTemplates } from '@/components/habits/checklist-templates'
import type { ChecklistItem } from '@orbit/shared/types/habit'

describe('ChecklistTemplates', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('shows save button when items are present', () => {
    const items: ChecklistItem[] = [{ text: 'Step 1', isChecked: false }]
    render(<ChecklistTemplates items={items} onLoad={vi.fn()} />)
    expect(screen.getByText('habits.form.saveAsTemplate')).toBeInTheDocument()
  })

  it('does not show save button when no items', () => {
    render(<ChecklistTemplates items={[]} onLoad={vi.fn()} />)
    expect(screen.queryByText('habits.form.saveAsTemplate')).not.toBeInTheDocument()
  })

  it('shows save form when save button clicked', () => {
    const items: ChecklistItem[] = [{ text: 'Step 1', isChecked: false }]
    render(<ChecklistTemplates items={items} onLoad={vi.fn()} />)
    fireEvent.click(screen.getByText('habits.form.saveAsTemplate'))
    expect(screen.getByPlaceholderText('habits.form.templateNamePlaceholder')).toBeInTheDocument()
  })

  it('saves a template to localStorage', () => {
    const items: ChecklistItem[] = [{ text: 'Step 1', isChecked: false }]
    render(<ChecklistTemplates items={items} onLoad={vi.fn()} />)

    fireEvent.click(screen.getByText('habits.form.saveAsTemplate'))
    const input = screen.getByPlaceholderText('habits.form.templateNamePlaceholder')
    fireEvent.change(input, { target: { value: 'Morning Routine' } })
    fireEvent.click(screen.getByText('common.save'))

    const stored = JSON.parse(localStorage.getItem('orbit-checklist-templates') ?? '[]')
    expect(stored).toHaveLength(1)
    expect(stored[0].name).toBe('Morning Routine')
    expect(stored[0].items).toEqual(['Step 1'])
  })

  it('loads a template calling onLoad', () => {
    // Pre-populate localStorage with a template
    localStorage.setItem(
      'orbit-checklist-templates',
      JSON.stringify([{ id: 'tmpl1', name: 'Workout', items: ['Warmup', 'Main'] }]),
    )

    const onLoad = vi.fn()
    render(
      <ChecklistTemplates items={[{ text: 'A', isChecked: false }]} onLoad={onLoad} />,
    )

    fireEvent.click(screen.getByText('Workout'))
    expect(onLoad).toHaveBeenCalledWith([
      { text: 'Warmup', isChecked: false },
      { text: 'Main', isChecked: false },
    ])
  })

  it('migrates legacy template storage to the current key', () => {
    localStorage.setItem(
      'orbit:checklist-templates',
      JSON.stringify([{ id: 'tmpl-legacy', name: 'Packing', items: ['Passport'] }]),
    )

    render(
      <ChecklistTemplates items={[{ text: 'A', isChecked: false }]} onLoad={vi.fn()} />,
    )

    expect(screen.getByText('Packing')).toBeInTheDocument()
    expect(localStorage.getItem('orbit-checklist-templates')).toContain('Packing')
    expect(localStorage.getItem('orbit:checklist-templates')).toBeNull()
  })

  it('falls back to legacy templates when the current key is corrupted', () => {
    localStorage.setItem('orbit-checklist-templates', '{not valid json')
    localStorage.setItem(
      'orbit:checklist-templates',
      JSON.stringify([{ id: 'tmpl-legacy', name: 'Packing', items: ['Passport'] }]),
    )

    render(
      <ChecklistTemplates items={[{ text: 'A', isChecked: false }]} onLoad={vi.fn()} />,
    )

    expect(screen.getByText('Packing')).toBeInTheDocument()
    expect(localStorage.getItem('orbit-checklist-templates')).toBe('{not valid json')
    expect(localStorage.getItem('orbit:checklist-templates')).toContain('Packing')
  })

  it('deletes a template', () => {
    localStorage.setItem(
      'orbit-checklist-templates',
      JSON.stringify([{ id: 'tmpl1', name: 'Workout', items: ['Warmup'] }]),
    )

    render(
      <ChecklistTemplates items={[{ text: 'A', isChecked: false }]} onLoad={vi.fn()} />,
    )

    const deleteBtn = screen.getByLabelText('common.delete: Workout')
    fireEvent.click(deleteBtn)

    const stored = JSON.parse(localStorage.getItem('orbit-checklist-templates') ?? '[]')
    expect(stored).toHaveLength(0)
  })
})

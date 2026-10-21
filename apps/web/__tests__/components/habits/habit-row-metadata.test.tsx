import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMockHabit } from '@orbit/shared/__tests__/factories'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { HabitRow } from '@/components/habits/habit-row'
import type { NormalizedHabit } from '@orbit/shared/types/habit'

const locale = vi.hoisted(() => ({ value: 'en' }))
vi.mock('next-intl', () => ({ useTranslations: () => (key: string, values?: { done: number; total: number }) => {
  const messages = locale.value === 'en' ? en : ptBR
  if (key === 'habits.form.typeHabit') return messages.habits.form.typeHabit
  if (key === 'habits.rowTypeTask') return messages.habits.rowTypeTask
  if (key === 'habits.form.checklist') return messages.habits.form.checklist
  if (key === 'habits.rowProgress' && values) return messages.habits.rowProgress.replace('{done}', String(values.done)).replace('{total}', String(values.total))
  return key
} }))
afterEach(() => { locale.value = 'en'; document.documentElement.style.removeProperty('font-size'); vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('integrated row metadata', () => {
  it('preserves actual checklist values across schedules and completion states', () => {
    const schedules: Partial<NormalizedHabit>[] = [{ frequencyUnit: null }, { isGeneral: true }, { isFlexible: true, frequencyUnit: 'Week' }, { frequencyUnit: 'Day' }]
    for (const schedule of schedules) for (const state of ['empty', 'overdue', 'bad', 'done'] as const) {
      const onLog = vi.fn()
      const { container, unmount } = render(<HabitRow habit={createMockHabit({ ...schedule, title: 'Read', isBadHabit: state === 'bad', isOverdue: state === 'overdue', checklistItems: [{ text: 'Page', isChecked: true }, { text: 'Page', isChecked: false }] })}
        state={state} completionReadOnly completionStatusUnavailable={state === 'empty'} selectMode={state === 'bad'} actions={{ onLog }} />)
      expect(container.querySelector('[data-habit-row-checklist]')?.textContent).toBe('1/2')
      expect(container.querySelectorAll('[data-habit-row-type]')).toHaveLength(1)
      expect(container.querySelector('[data-habit-row-body]')?.getAttribute('aria-label')!.split('Checklist, 1 of 2')).toHaveLength(2)
      expect(onLog).not.toHaveBeenCalled()
      unmount()
    }
  })

  it('moves an oversized whole token to the existing footer and restores ordinary layout when it fits', () => {
    let available = 48
    const callbacks: (() => void)[] = []
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback: () => void) { callbacks.push(callback) }
      observe() {}
      disconnect() {}
    })
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      return new DOMRect(0, 0, this.hasAttribute('data-habit-row-title-block') ? available : this.querySelector('[data-habit-row-checklist]') ? 60 : 40, 20)
    })
    const { container } = render(<HabitRow habit={createMockHabit({ title: 'Read', checklistItems: [{ text: 'Page', isChecked: true }] })} />)
    act(() => { callbacks.forEach((callback) => callback()) })
    expect(container.querySelector('[data-habit-row-heading]')).not.toBeNull()
    expect(container.querySelectorAll('[data-habit-row-meta]')).toHaveLength(1)
    expect(container.querySelector('[data-habit-row-heading] [data-habit-row-meta]')).toBeNull()
    expect(container.querySelector('svg.tabler-icon-list-check')).toHaveAttribute('width', '16')
    available = 200
    act(() => { callbacks.forEach((callback) => callback()) })
    expect(container.querySelector('[data-habit-row-heading]')).toBeNull()
    expect(container.querySelectorAll('[data-habit-row-type]')).toHaveLength(1)
  })

  it.each(['en', 'pt-BR'].flatMap((language) => [1, 2, 2.5].map((scale) => ({ language, scale }))))(
    'leads with one type and retains actual checklist progress in $language at $scale text', ({ language, scale }) => {
      locale.value = language
      document.documentElement.style.fontSize = `${16 * scale}px`
      const habit = createMockHabit({ title: 'Read pages', description: 'Read before breakfast.', checklistItems: Array.from({ length: 5 }, (_, index) => ({ text: 'Page', isChecked: index < 2 })) })
      const { container } = render(<HabitRow habit={habit} hasChildren childProgress={{ done: 1, total: 3 }} meta={['1/3', '08:00']} />)
      const strips = container.querySelectorAll('[data-habit-row-meta]')
      expect(strips).toHaveLength(1)
      const strip = strips[0]!
      expect(strip.querySelectorAll('[data-habit-row-type]')).toHaveLength(1)
      const type = strip.querySelector('[data-habit-row-type]')
      expect(type, 'type belongs to the single metadata flow').not.toBeNull()
      expect(strip.firstElementChild?.contains(type)).toBe(true)
      expect(strip.textContent).toMatch(language === 'en' ? /^Habit/ : /^Hábito/)
      expect(strip.textContent).toContain('1/3')
      expect(strip.textContent).toContain('08:00')
      const checklist = strip.querySelector('[data-habit-row-checklist]')!
      expect(checklist, 'actual nonempty checklist is visible').not.toBeNull()
      expect(checklist.textContent).toBe('2/5')
      expect(checklist.querySelector('svg')).toHaveAttribute('width', scale > 1.3 ? '24' : '16')
      expect(checklist.querySelector('svg')).toHaveAttribute('stroke-width', '1.5')
      expect(checklist.querySelector('svg')).toHaveClass('tabler-icon-list-check')
      expect(checklist.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
      expect(checklist.querySelector('button,a,[tabindex]')).toBeNull()
      expect(strip).toHaveAttribute('aria-hidden', 'true')
      const body = container.querySelector('[data-habit-row-body]')!
      const label = body.getAttribute('aria-label')!
      expect(label.split(language === 'en' ? 'Habit' : 'Hábito')).toHaveLength(2)
      expect(label.split(language === 'en' ? 'Checklist, 2 of 5' : 'Checklist, 2 de 5')).toHaveLength(2)
      expect(body).toHaveAccessibleDescription(habit.description!)
    },
  )

  it.each([[0, 0], [0, 1], [0, 5], [2, 5], [5, 5], [50, 50]])('renders honest %s/%s counts without changing actions or items', (done, total) => {
    const checklistItems = Array.from({ length: total }, (_, index) => ({ text: 'Same page', isChecked: index < done }))
    const original = structuredClone(checklistItems)
    const onLog = vi.fn(), onDetail = vi.fn()
    const { container } = render(<HabitRow habit={createMockHabit({ title: 'Read', checklistItems })} actions={{ onLog, onDetail }} />)
    const checklist = container.querySelector('[data-habit-row-checklist]')
    if (total) expect(checklist?.textContent).toBe(`${done}/${total}`)
    else { expect(checklist).toBeNull(); expect(container.querySelector('[data-habit-row-meta]')!.textContent).toBe('Habit') }
    expect(checklistItems).toEqual(original)
    expect(onLog).not.toHaveBeenCalled()
    expect(screen.getByTestId('habit-status-toggle')).toHaveAttribute('aria-label', expect.stringContaining('habits.logHabit'))
    fireEvent.click(container.querySelector('[data-habit-row-body]')!)
    expect(onDetail).toHaveBeenCalledOnce()
    expect(onLog).not.toHaveBeenCalled()
  })

  it.each([false, true])('updates received checklist values without replacing title, selecting=%s', (selectMode) => {
    const actions = { onLog: vi.fn(), onDetail: vi.fn(), onToggleSelection: vi.fn() }
    const habit = createMockHabit({ title: 'Read', frequencyUnit: null, checklistItems: [{ text: 'Page', isChecked: false }] })
    const { container, rerender } = render(<HabitRow habit={habit} selectMode={selectMode} structuralColumn actions={actions} />)
    expect(container.querySelector('[data-habit-row-checklist]')?.textContent).toBe('0/1')
    rerender(<HabitRow habit={{ ...habit, checklistItems: [{ text: 'Page', isChecked: true }] }} selectMode={selectMode} structuralColumn actions={actions} />)
    expect(container.querySelector('[data-habit-row-checklist]')?.textContent).toBe('1/1')
    const body = container.querySelector('[data-habit-row-body]')!
    expect(body).toHaveAccessibleName('Read, Task Checklist, 1 of 1')
    if (selectMode) expect(container.querySelector('[data-habit-row-control="selection"]')).toHaveAccessibleName('Read, Task Checklist, 1 of 1')
    fireEvent.click(body)
    expect(selectMode ? actions.onToggleSelection : actions.onDetail).toHaveBeenCalledOnce()
    expect(actions.onLog).not.toHaveBeenCalled()
    rerender(<HabitRow habit={createMockHabit({ id: 'replacement', title: 'Walk', isGeneral: true })} />)
    expect(container.querySelector('[data-habit-row-checklist]')).toBeNull()
    expect(container.querySelector('[data-habit-row-body]')).toHaveAccessibleName('Walk, Habit')
  })
})

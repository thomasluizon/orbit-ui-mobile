import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { createMockHabit } from '@orbit/shared/__tests__/factories'
import { HabitRow } from '@/components/habits/habit-row'

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))

const descriptions = [
  ['Read two pages before breakfast.', 'Read two pages before breakfast.'],
  ['Leia duas páginas antes do café.', 'Leia duas páginas antes do café.'],
  ['## Read\n- **two** pages\n> `daily`', 'Read two pages daily'],
  ['[Guide](https://example.invalid/guide) ![Pages](https://example.invalid/image.png)', 'Guide Pages'],
  ['https://example.invalid/guide <img src="https://example.invalid/image.png">', 'https://example.invalid/guide <img src="https://example.invalid/image.png">'],
  ['**unfinished [ 📚 ' + 'a'.repeat(300), '**unfinished [ 📚 ' + 'a'.repeat(300)],
]

describe('stored habit row descriptions', () => {
  it.each(descriptions)('renders inert preview between title and metadata: %s', (description, preview) => {
    const habit = createMockHabit({ title: 'Read ten minutes', description })
    const { container } = render(<HabitRow habit={habit} meta={['08:00']} />)
    const line = screen.getByText(preview, { exact: true })
    expect(line).toHaveAttribute('data-habit-row-description')
    expect(line.previousElementSibling).toHaveAttribute('data-personal-text')
    const type = line.nextElementSibling!
    expect(type).toHaveAttribute('data-habit-row-type')
    expect(type).toHaveTextContent('habits.form.typeHabit')
    expect(type.nextElementSibling).toHaveAttribute('data-habit-row-meta')
    expect(container.querySelectorAll('a,img,iframe')).toHaveLength(0)
    expect(line.querySelectorAll('*')).toHaveLength(0)
    expect(habit.description).toBe(description)
  })

  it.each([null, '', ' \n\t ', '![](https://example.invalid/image.png)', '> ', '# ', '` `'])('omits normalized-empty content and its gap: %s', (description) => {
    const { container } = render(<HabitRow habit={createMockHabit({ title: 'Read', description })} meta={['08:00']} />)
    expect(container.querySelector('[data-habit-row-description]')).toBeNull()
    const title = container.querySelector('[data-personal-text]')!
    expect(title.nextElementSibling).toHaveAttribute('data-habit-row-type')
    expect(title.nextElementSibling!.nextElementSibling).toHaveAttribute('data-habit-row-meta')
    expect(title.parentElement!.children).toHaveLength(3)
  })

  it.each([false, true])('keeps detail, selection and completion independent while selected=%s', (selectMode) => {
    const onDetail = vi.fn(), onToggleSelection = vi.fn(), onLog = vi.fn()
    const description = 'Read two pages before breakfast.'
    const { container } = render(<HabitRow habit={createMockHabit({ title: 'Read', description })}
      selectMode={selectMode} selected={selectMode} actions={{ onDetail, onToggleSelection, onLog }} />)
    const body = container.querySelector<HTMLButtonElement>('[data-habit-row-body]')!
    expect(body).toHaveAccessibleDescription(description)
    expect(body).toHaveAccessibleName('Read, habits.form.typeHabit')
    expect(container.querySelectorAll('[data-habit-row-description]')).toHaveLength(1)
    expect(container.querySelector('[aria-hidden="true"] button, [aria-hidden="true"] [tabindex]')).toBeNull()
    fireEvent.click(body)
    expect(selectMode ? onToggleSelection : onDetail).toHaveBeenCalledOnce()
    expect(selectMode ? onDetail : onToggleSelection).not.toHaveBeenCalled()
    expect(onLog).not.toHaveBeenCalled()
    if (!selectMode) {
      fireEvent.click(screen.getByTestId('habit-status-toggle'))
      expect(onLog).toHaveBeenCalledOnce()
      expect(onDetail).toHaveBeenCalledOnce()
    }
  })

  it.each([
    [null, false, false, 'habits.form.typeTask'],
    ['Day', false, false, 'habits.form.typeHabit'],
    ['Week', true, false, 'habits.form.typeHabit'],
    [null, false, true, 'habits.form.typeHabit'],
  ] as const)('keeps description and complete type for cadence %s, flexible=%s, general=%s', (frequencyUnit, isFlexible, isGeneral, expectedType) => {
    const habit = createMockHabit({ title: 'Read ten minutes', description: 'Read two pages.', frequencyUnit, isFlexible, isGeneral })
    const { container } = render(<HabitRow habit={habit} meta={['08:00']} />)
    const type = container.querySelector('[data-habit-row-type]')!
    expect(type.textContent).toBe(expectedType)
    expect(type.previousElementSibling).toHaveAttribute('data-habit-row-description')
    expect(type.previousElementSibling!.previousElementSibling).toHaveTextContent(habit.title)
    expect(type.nextElementSibling).toHaveAttribute('data-habit-row-meta')
    expect(container.querySelector('[data-habit-row-body]')).toHaveAccessibleName(`${habit.title}, ${expectedType} 08:00`)
  })
})

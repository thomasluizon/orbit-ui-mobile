import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { SubHabitEditor } from '@/components/habits/create-habit-modal/sub-habit-editor'
import { HabitUnderstanding } from '@/components/habits/habit-form-fields/habit-understanding'
import { ReminderSection } from '@/components/habits/habit-form-fields/reminder-section'
import { TagEditorRow } from '@/components/habits/habit-form-fields/tag-editor-row'

vi.mock('@/hooks/use-push-subscriptions', () => ({
  usePushSubscriptions: () => ({ count: 0, max: 5, isCurrentDeviceRegistered: false, isLoading: false, isError: false }),
}))


vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}(${JSON.stringify(values)})` : key,
}))

vi.mock('@/components/ui/app-select', () => ({
  AppSelect: ({
    value,
    options,
    onChange,
    label,
  }: {
    value: string
    options: ReadonlyArray<{ value: string; label: string }>
    onChange: (value: string) => void
    label?: string
  }) => (
    <select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  ),
}))

const translate = (key: string, values?: Record<string, unknown>) =>
  values ? `${key}(${JSON.stringify(values)})` : key

const understandingLabels = {
  field: 'Describe the habit',
  placeholder: 'Run every weekday',
  understood: 'Orbit understood',
  understoodAstra: 'Astra proposed',
  unresolved: 'Choose a schedule',
  days: 'Active days',
  less: 'Less often',
  more: 'More often',
  count: (count: number) => `${count} times a week`,
  repeat: (count: number) => `Every ${count} weeks`,
  repeatLess: 'Repeat less often',
  repeatMore: 'Repeat more often',
  proposed: 'Proposed by Astra',
}

function collectComponentFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = join(directory, entry.name)
    if (entry.isDirectory()) return collectComponentFiles(entryPath)
    return entry.name.endsWith('.tsx') ? [entryPath] : []
  })
}

function renderPhraseField(sentence: string | null = null) {
  return render(
    <HabitUnderstanding
      value={sentence ? "Run" : ""}
      emoji="\u{1F3C3}"
      days={[]}
      dayOptions={[]}
      quantity={1}
      mode="fixed"
      sentence={sentence}
      consumed={[]}
      onValueChange={vi.fn()}
      onEmojiSelect={vi.fn()}
      onToggleDay={vi.fn()}
      onQuantityChange={vi.fn()}
      labels={understandingLabels}
    />,
  )
}

describe('habit form focus treatments', () => {
  it('replaces a readable sentence in place without retaining the old copy', () => {
    const view = renderPhraseField('A')
    const props = { value: 'Run', emoji: '', days: [], dayOptions: [], quantity: 1, mode: 'fixed' as const, consumed: [], onValueChange: vi.fn(), onEmojiSelect: vi.fn(), onToggleDay: vi.fn(), onQuantityChange: vi.fn(), labels: understandingLabels }
    view.rerender(<HabitUnderstanding {...props} sentence="B" />)
    expect(screen.queryByText('A')).toBeNull()
    expect(screen.getByText('B')).toBeInTheDocument()
  })

  it('keeps the emoji well as the only emoji control', () => {
    renderPhraseField('Every day')
    expect(screen.queryByTestId('habit-suggest-emoji')).toBeNull()
    expect(screen.getByRole('button', { name: 'habits.form.emojiOpenPicker' })).toBeInTheDocument()
  })

  it('gives the phrase and sub-habit inputs one replacement focus ring', () => {
    const view = renderPhraseField()
    const phrase = screen.getByRole('textbox', { name: understandingLabels.field })
    expect(phrase).toHaveClass('focus-visible:outline-none')
    expect(phrase.parentElement).toHaveClass('has-[textarea:focus-visible]:shadow-[inset_0_0_0_2px_var(--primary)]')
    view.unmount()
    render(<SubHabitEditor subHabits={[{ id: 'sub-1', value: 'Warm up' }]} onUpdateSubHabit={vi.fn()} onRemoveSubHabit={vi.fn()} onAddSubHabit={vi.fn()} />)
    const input = screen.getByRole('textbox')
    expect(input).toHaveClass('focus-visible:outline-none')
    expect(input.parentElement).toHaveClass('has-[input:focus-visible]:shadow-[inset_0_0_0_2px_var(--primary)]')
  })

  it('restores a system outline that outranks utilities in forced colors', () => {
    const stylesheet = readFileSync(resolve(process.cwd(), 'app/globals.css'), 'utf8')
      .replaceAll('\r\n', '\n')

    expect(stylesheet).toMatch(
      /@media \(forced-colors: active\) \{\s*:focus-visible \{[^}]*outline: 2px solid CanvasText !important;[^}]*\}\s*\}/,
    )
  })

  it('drops the global forced-colors outline on a field that paints its own perimeter', () => {
    const stylesheet = readFileSync(resolve(process.cwd(), 'app/globals.css'), 'utf8')
      .replaceAll('\r\n', '\n')

    expect(stylesheet).toMatch(
      /@media \(forced-colors: active\) \{[^@]*\[data-focus-perimeter\] :is\(input, textarea\):focus-visible \{\s*outline: none !important;/,
    )
  })

  it('pairs every forced-colors outline opt-out with a system-color perimeter', () => {
    const roots = ['components', 'app'].map((directory) => resolve(process.cwd(), directory))
    const offenders = roots.flatMap((root) => collectComponentFiles(root))
      .map((file) => ({ file, source: readFileSync(file, 'utf8') }))
      .filter(({ source }) => source.includes('data-focus-perimeter'))
      .filter(({ source }) => {
        const optOuts = source.split('data-focus-perimeter').length - 1
        const perimeters = source.split('border-[Highlight]').length - 1
        return perimeters < optOuts
      })
      .map(({ file }) => relative(process.cwd(), file))

    expect(offenders).toEqual([])
  })

  it('paints the habit phrase perimeter above its mirror', () => {
    const view = renderPhraseField()

    const field = view.container.querySelector('[data-habit-phrase-field]')
    expect(field).not.toBeNull()
    const mirror = field?.querySelector('p')
    expect(mirror).not.toBeNull()
    expect(mirror?.className).not.toContain('bg-[')
    expect(field?.className).toContain('bg-[var(--bg-field)]')
    expect(field?.className).toContain('shadow-[inset_0_0_0_1px_var(--border-control)]')
    expect(field).toHaveAttribute('data-focus-perimeter')
  })

  it('shows the design-system focus shadow on the custom reminder input', () => {
    render(
      <ReminderSection
        reminderEnabled
        reminderTimes={[]}
        onReminderTimesChange={vi.fn()}
        onToggleReminder={vi.fn()}
        reminderLabel={String}
        t={translate as Parameters<typeof ReminderSection>[0]['t']}
      />,
    )

    fireEvent.click(screen.getByText('habits.form.reminderAdd'))
    fireEvent.click(screen.getByText('habits.form.reminderCustom'))

    const input = screen.getByLabelText('habits.form.reminderCustomLabel')
    expect(input).toHaveClass('focus-visible:outline-none')
    expect(input).toHaveClass('focus-visible:shadow-[inset_0_0_0_2px_var(--primary)]')
  })

  it('shows the design-system focus shadow on the tag editor input', () => {
    render(
      <TagEditorRow
        value=""
        inputAriaLabel="Tag name"
        actionLabel="Save"
        cancelAriaLabel="Cancel"
        disabled={false}
        onChange={vi.fn()}
        onCommit={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    const input = screen.getByRole('textbox', { name: 'Tag name' })
    expect(input).toHaveClass('focus-visible:outline-none')
    expect(input).toHaveClass('focus-visible:shadow-[inset_0_0_0_2px_var(--primary)]')
  })

  it('keeps the sub-habit input and remove action in keyboard order', async () => {
    render(
      <SubHabitEditor
        subHabits={[{ id: 'sub-1', value: 'Warm up' }]}
        onUpdateSubHabit={vi.fn()}
        onRemoveSubHabit={vi.fn()}
        onAddSubHabit={vi.fn()}
      />,
    )

    const user = userEvent.setup()
    await user.tab()
    expect(screen.getByRole('textbox')).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('button', { name: 'habits.form.removeSubHabit' })).toHaveFocus()
  })
})

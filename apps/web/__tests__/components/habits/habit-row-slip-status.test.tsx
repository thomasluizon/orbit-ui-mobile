import { useState } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMockHabit, createMockHabitScheduleItem } from '@orbit/shared/__tests__/factories'
import { buildHabitDetailChildDateModel, buildSuccessfulLogPatch } from '@orbit/shared/utils'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { HabitRow } from '@/components/habits/habit-row'

const locale = vi.hoisted((): { current: 'en' | 'pt-BR' } => ({ current: 'en' }))

function translate(key: string): string {
  const messages = locale.current === 'en' ? en : ptBR
  return key.split('.').reduce<unknown>((value, part) =>
    (value as Record<string, unknown>)[part], messages) as string
}

vi.mock('next-intl', () => ({ useTranslations: () => translate }))
afterEach(cleanup)

function LoggingRow({ parent, selectMode = false, logged = 'none' }: Readonly<{ parent: boolean; selectMode?: boolean; logged?: 'none' | 'completed' | 'range' }>) {
  const initial = createMockHabit({ title: 'Coffee', isBadHabit: true, isCompleted: logged === 'completed', isLoggedInRange: logged === 'range',
    dueDate: '2026-09-12', scheduledDates: ['2026-09-12'] })
  const [habit, setHabit] = useState(initial)
  return <HabitRow habit={habit} state="bad" hasChildren={parent} selectMode={selectMode}
    childProgress={parent ? { done: 1, total: 2 } : undefined}
    actions={{ onLog: () => setHabit(createMockHabit({ ...habit, ...buildSuccessfulLogPatch(createMockHabitScheduleItem()) })),
      onUnlog: () => setHabit(initial) }} />
}

describe.each(['en', 'pt-BR'] as const)('bad-habit status in %s', (language) => {
  it.each([false, true])('announces status and performs log then undo, parent=%s', (parent) => {
    locale.current = language
    const pending = language === 'en' ? 'Not done, Log Habit: Coffee' : 'Não feito, Registrar hábito: Coffee'
    const slipped = language === 'en' ? 'Slipped, Mark incomplete: Coffee' : 'Deslize, Marcar como não feito: Coffee'
    const progress = parent ? ', 1/2' : ''
    const { container } = render(<LoggingRow parent={parent} />)
    const log = screen.getByRole('button', { name: pending + progress })
    expect(screen.queryByRole('button', { name: slipped + progress })).toBeNull()
    if (!parent) expect(container.querySelector('[data-status="bad"]')).toBeInTheDocument()
    fireEvent.click(log)
    fireEvent.click(screen.getByRole('button', { name: slipped + progress }))
    expect(screen.getByRole('button', { name: pending + progress })).toBeInTheDocument()
  })

  it.each([false, true])('announces selection glyph status, parent=%s', (parent) => {
    locale.current = language
    for (const logged of ['none', 'completed', 'range'] as const) {
      const status = logged !== 'none' ? (language === 'en' ? 'Slipped' : 'Deslize') : (language === 'en' ? 'Not done' : 'Não feito')
      const { unmount } = render(<LoggingRow parent={parent} selectMode logged={logged} />)
      expect(screen.getByRole('img', { name: status + (parent ? ', 1/2' : '') })).toBeInTheDocument()
      unmount()
    }
  })
})

describe.each(['en', 'pt-BR'] as const)('bad-habit detail child status in %s', (language) => {
  it.each([false, true])('preserves the bad-habit graphic and announces the outcome, logged=%s', (logged) => {
    locale.current = language
    const scopedChild = createMockHabit({ title: 'Coffee', isBadHabit: true, isLoggedInRange: logged,
      dueDate: '2026-09-12', scheduledDates: ['2026-09-12'] })
    const { habit, completed, canLog } = buildHabitDetailChildDateModel(scopedChild, scopedChild, '2026-09-12', '2026-09-12')
    const expected = logged
      ? (language === 'en' ? 'Slipped, Mark incomplete: Coffee' : 'Deslize, Marcar como não feito: Coffee')
      : (language === 'en' ? 'Not done, Log Habit: Coffee' : 'Não feito, Registrar hábito: Coffee')
    const { container } = render(<HabitRow habit={habit} child depth={1} state={completed ? 'done' : 'empty'} canLog={canLog} />)
    expect(screen.getByRole('button', { name: expected })).toBeInTheDocument()
    expect(container.querySelector('[role="img"][data-status="bad"]')).toBeInTheDocument()
  })
})

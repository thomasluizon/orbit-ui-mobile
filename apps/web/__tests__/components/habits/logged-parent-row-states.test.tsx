import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { NextIntlClientProvider, createTranslator } from 'next-intl'
import en from '@orbit/shared/i18n/en.json'
import { computeHabitRowNextDueHint, isHabitDoneForRange } from '@orbit/shared/utils'
import { LOGGED_PARENT_TODAY, loggedParentRowCases, type LoggedParentRowCase } from '@orbit/shared/test-support/logged-parent-row-cases'
import type { HabitStatus } from '@orbit/shared/contracts/lists'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
import { HabitRow } from '@/components/habits/habit-row'

const t = createTranslator({ locale: 'en', messages: en })

/** The check state that `habit-list.tsx` derives for a row once the recent completion has settled. */
function settledListState(habit: NormalizedHabit): HabitStatus {
  if (habit.isBadHabit) return 'bad'
  return isHabitDoneForRange(habit) ? 'done' : 'empty'
}

/** Builds the row as `habit-list.tsx` and `habit-detail-screen.tsx` do: the caller gives the check state and the next due token. */
function renderCase({ habit, hasChildren, depth, selectedDate }: LoggedParentRowCase, state = settledListState(habit)) {
  const nextDue = computeHabitRowNextDueHint(habit, { selectedDate, today: LOGGED_PARENT_TODAY, hasChildren }, t as never, 'en')
  const { container } = render(<NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
    <HabitRow habit={habit} state={state} depth={depth} child={depth > 0} hasChildren={hasChildren}
      childProgress={hasChildren ? { done: 0, total: 2 } : undefined}
      meta={[...(hasChildren ? [t('habits.rowProgress', { done: 0, total: 2 })] : []), ...(nextDue ? [{ kind: 'future' as const, label: nextDue }] : [])]} />
  </NextIntlClientProvider>)
  const row = container.querySelector<HTMLElement>('[data-testid="habit-row"]')!
  return {
    dimmed: row.querySelector<HTMLElement>('[data-habit-row-title-block] > :first-child')!.style.color === 'var(--habit-row-meta-color)',
    nextDueVisible: [...row.querySelectorAll<HTMLElement>('[data-habit-row-meta] [data-habit-row-meta-token]')].at(-1)?.textContent.replace(/·$/, '') === 'due tomorrow',
  }
}

afterEach(() => { cleanup() })

describe('logged parent row decision', () => {
  it.each(loggedParentRowCases)('dims $name and shows its next due label as the shared rule decides', (rowCase) => {
    expect(renderCase(rowCase)).toEqual({ dimmed: rowCase.loggedParent, nextDueVisible: rowCase.nextDueVisible })
  })

  it('reads the logged state from the habit, not from the done check that the list paints during a recent completion', () => {
    const openParent = loggedParentRowCases.find((rowCase) => rowCase.name === 'a parent with no log')!
    expect(renderCase(openParent, 'done')).toEqual({ dimmed: false, nextDueVisible: false })
  })
})

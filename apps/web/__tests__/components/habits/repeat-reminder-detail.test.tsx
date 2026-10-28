import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { RepeatReminderDetail } from '@/components/habits/repeat-reminder-detail'
import { createMockHabit } from '@orbit/shared/__tests__/factories'
import { createTimeDisplay } from '@orbit/shared/utils'
import en from '@orbit/shared/i18n/en.json'

const mutation = vi.hoisted(() => ({ mutateAsync: vi.fn(), isPending: false }))
vi.mock('@/hooks/use-correct-habit-dose', () => ({ useCorrectHabitDose: () => mutation }))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: { timeZone: 'America/Sao_Paulo', uses24HourClock: true } }) }))
vi.mock('@/hooks/use-time-format', () => ({ useTimeFormat: () => ({ displayReminderClock: createTimeDisplay('en', true, 'America/Sao_Paulo').displayClock }) }))
vi.mock('next-intl', () => ({ useLocale: () => 'en', useTranslations: () => (key: string, values?: { time: string }) => {
  const template = key.split('.').reduce<unknown>((value, part) => (value as Record<string, unknown>)[part], en)
  return typeof template === 'string' ? template.replace('{time}', values?.time ?? '') : key
} }))
vi.mock('@/components/ui/sheet', () => ({ Sheet: ({ children, actions }: { children: ReactNode; actions: ReactNode }) => <section role="dialog">{children}{actions}</section>, useSheetHost: () => ({ sheetRef: { current: null }, closeSheet: (action?: () => void) => action?.() }) }))
const log = { id: 'log-1', date: '2026-10-28', value: 1, createdAtUtc: '2026-10-29T02:30:00Z', takenAtUtc: '2026-10-29T02:30:00Z', reminderAtUtc: '2026-10-29T02:00:00Z' }
const habit = createMockHabit({ repeatReminder: { intervalMinutes: 30 }, nextReminderAtUtc: '2026-10-29T03:00:00Z' })
beforeEach(() => { mutation.mutateAsync.mockReset().mockResolvedValue(undefined) })
it('shows server next time and corrects a dose using the reminder instant across midnight', async () => {
  const view = render(<RepeatReminderDetail habit={habit} logs={[log]} />)
  expect(screen.getByText('Next at 00:00')).toBeInTheDocument()
  expect(screen.getByText('Taken at 23:30')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Change time taken' }))
  fireEvent.click(screen.getByRole('button', { name: 'Use reminder time' }))
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(mutation.mutateAsync).toHaveBeenCalledExactlyOnceWith({ logId: log.id, takenAtUtc: '2026-10-29T02:00:00.000Z' }))
  view.rerender(<RepeatReminderDetail habit={{ ...habit, nextReminderAtUtc: '2026-10-29T06:00:00Z' }} logs={[{ ...log, takenAtUtc: log.reminderAtUtc }]} />)
  expect(screen.getByText('Next at 03:00')).toBeInTheDocument()
  expect(screen.getByText('Taken at 23:00')).toBeInTheDocument()
})
it('keeps the dose draft open after a refused correction', async () => {
  mutation.mutateAsync.mockRejectedValue(new Error('Offline'))
  render(<RepeatReminderDetail habit={habit} logs={[log]} />)
  fireEvent.click(screen.getByRole('button', { name: 'Change time taken' }))
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(en.habits.doseSaveError)
  expect(screen.getByRole('dialog')).toBeInTheDocument()
})

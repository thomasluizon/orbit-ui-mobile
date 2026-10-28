import { act, renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { expect, it, vi } from 'vitest'
import { habitKeys } from '@orbit/shared/query'
import { correctHabitDose } from '@/app/actions/repeat-reminders'
import { useCorrectHabitDose } from '@/hooks/use-correct-habit-dose'
vi.mock('@/app/actions/repeat-reminders', () => ({ correctHabitDose: vi.fn(() => Promise.resolve({ ok: true, data: undefined })) }))
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
it('corrects one dose and refreshes authoritative habit reads', async () => {
  const client = new QueryClient()
  const invalidate = vi.spyOn(client, 'invalidateQueries')
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
  const { result, unmount } = renderHook(() => useCorrectHabitDose('habit'), { wrapper })
  const input = { logId: 'log', takenAtUtc: '2026-10-29T02:00:30.125Z' }
  await act(async () => { await result.current.mutateAsync(input) })
  expect(correctHabitDose).toHaveBeenCalledExactlyOnceWith('habit', 'log', input.takenAtUtc, null)
  expect(invalidate).toHaveBeenCalledWith({ queryKey: habitKeys.all })
  unmount()
  client.clear()
})

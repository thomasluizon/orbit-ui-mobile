import { beforeEach, expect, it, vi } from 'vitest'
import { correctHabitDose } from '@/app/actions/repeat-reminders'
import { serverAuthMutate } from '@/lib/server-fetch'
vi.mock('@/lib/server-fetch', () => ({ serverAuthMutate: vi.fn() }))
beforeEach(() => vi.mocked(serverAuthMutate).mockReset())
it('patches the selected log with the exact dose instant and held account', async () => {
  vi.mocked(serverAuthMutate).mockResolvedValue(undefined)
  const takenAtUtc = '2026-10-29T02:00:30.125Z'
  expect(await correctHabitDose('habit', 'log', takenAtUtc, 'account')).toMatchObject({ ok: true })
  expect(serverAuthMutate).toHaveBeenCalledExactlyOnceWith('/api/habits/habit/logs/log/dose', { method: 'PATCH', body: JSON.stringify({ takenAtUtc }) }, 'account')
})
it('rejects a non-UTC dose before making a request', async () => {
  expect(await correctHabitDose('habit', 'log', '23:00', 'account')).toMatchObject({ ok: false })
  expect(serverAuthMutate).not.toHaveBeenCalled()
})

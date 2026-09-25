import { beforeEach, describe, expect, it, vi } from 'vitest'
import { API } from '@orbit/shared/api'
import { streakInfoSchema } from '@orbit/shared/types/gamification'

const serverAuthMutate = vi.hoisted(() => vi.fn())

vi.mock('@/lib/server-fetch', () => ({ serverAuthMutate }))

import { repairStreakGap } from '@/app/actions/gamification'

describe('gamification actions', () => {
  beforeEach(() => serverAuthMutate.mockReset())

  it('sends exactly the complete gap to the atomic repair write', async () => {
    serverAuthMutate.mockResolvedValue({ currentStreak: 8 })

    const result = await repairStreakGap(['2026-09-04', '2026-09-05'], null)

    expect(serverAuthMutate).toHaveBeenCalledWith(
      API.gamification.repairStreakGap,
      { method: 'POST', body: JSON.stringify({ dates: ['2026-09-04', '2026-09-05'] }) },
      null,
      streakInfoSchema,
    )
    expect(result).toEqual({ ok: true, data: { currentStreak: 8 } })
  })
})

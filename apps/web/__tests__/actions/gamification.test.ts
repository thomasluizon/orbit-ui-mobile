import { beforeEach, describe, expect, it, vi } from 'vitest'
import { API } from '@orbit/shared/api'
import { streakInfoSchema } from '@orbit/shared/types/gamification'

const serverAuthFetch = vi.hoisted(() => vi.fn())

vi.mock('@/lib/server-fetch', () => ({ serverAuthFetch }))

import { repairStreakGap } from '@/app/actions/gamification'

describe('gamification actions', () => {
  beforeEach(() => serverAuthFetch.mockReset())

  it('sends exactly the complete gap to the atomic repair write', async () => {
    serverAuthFetch.mockResolvedValue({ currentStreak: 8 })

    await repairStreakGap(['2026-09-04', '2026-09-05'])

    expect(serverAuthFetch).toHaveBeenCalledWith(
      API.gamification.repairStreakGap,
      { method: 'POST', body: JSON.stringify({ dates: ['2026-09-04', '2026-09-05'] }) },
      streakInfoSchema,
    )
  })
})

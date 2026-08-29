import { beforeEach, describe, expect, it, vi } from 'vitest'
import { API } from '@orbit/shared/api'
import { streakInfoSchema } from '@orbit/shared/types/gamification'

const serverAuthFetch = vi.hoisted(() => vi.fn())

vi.mock('@/lib/server-fetch', () => ({ serverAuthFetch }))

import { repairStreak } from '@/app/actions/gamification'

describe('gamification actions', () => {
  beforeEach(() => serverAuthFetch.mockReset())

  it('spends one streak freeze through the confirmed repair write', async () => {
    serverAuthFetch.mockResolvedValue({ currentStreak: 8 })

    await repairStreak()

    expect(serverAuthFetch).toHaveBeenCalledWith(
      API.gamification.repairStreak,
      { method: 'POST', body: '{}' },
      streakInfoSchema,
    )
  })
})

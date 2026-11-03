import { onlineManager, useQueryClient } from '@tanstack/react-query'
import { profileKeys } from '@orbit/shared/query'
import { getAccountDay } from '@orbit/shared/utils'
import type { Profile } from '@orbit/shared/types/profile'
import { getAccountId } from '@/lib/account-scope'
import { getAccountGeneration } from '@/lib/session-epoch'
import { fetchProfile } from './use-profile'
import { captureError } from '@/lib/sentry'

export type RestoreHabitInput = string | { habitId: string; reconcileNotFound: true }

export async function resolveHabitLogDate(
  queryClient: ReturnType<typeof useQueryClient>,
  occurrenceTime: Date,
  account: HabitAccount,
): Promise<string | undefined> {
  const cachedProfile = queryClient.getQueryData<Profile>(profileKeys.detail())
  if (cachedProfile) return getAccountDay(occurrenceTime, cachedProfile.timeZone)
  if (!onlineManager.isOnline() || queryClient.getQueryState(profileKeys.detail())?.fetchStatus === 'paused') {
    return undefined
  }
  let profile: Profile | undefined
  try {
    profile = await fetchProfile()
  } catch (error) {
    /** https://github.com/thomasluizon/orbit-tickets/issues/1928: leave an unresolved account day to the server. */
    captureError(error)
  }
  account.assertCurrent()
  if (!profile) return undefined
  queryClient.setQueryData(profileKeys.detail(), profile)
  return getAccountDay(occurrenceTime, profile.timeZone)
}

function captureHabitAccount(): HabitAccount {
  const accountId = getAccountId()
  const generation = getAccountGeneration()
  const stillCurrent = () => accountId === getAccountId() && generation === getAccountGeneration()
  return {
    stillCurrent, assertCurrent: () => {
      if (!stillCurrent()) throw new Error('Account changed')
    }
  }
}

export interface HabitAccount {
  stillCurrent: () => boolean
  assertCurrent: () => void
}

export function withAccountGuard<TResult>(
  mutation: (account: HabitAccount) => TResult,
  intendedAccount?: HabitAccount,
): TResult {
  const account = intendedAccount ?? captureHabitAccount()
  account.assertCurrent()
  return mutation(account)
}

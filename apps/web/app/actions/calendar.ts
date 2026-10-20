'use server'

import { API } from '@orbit/shared/api'
import { serverAuthFetch, serverAuthMutate } from '@/lib/server-fetch'
import { wrapServerAction, type ServerActionResult } from './action-result'

export async function getUserCalendars(): Promise<ServerActionResult<unknown>> {
  return wrapServerAction(() => serverAuthFetch(API.calendar.calendars, { method: 'GET' }))
}

export async function setSelectedCalendars(
  calendarIds: string[],
  intendedAccountId: string | null,
): Promise<ServerActionResult<unknown>> {
  return wrapServerAction(() => serverAuthMutate(API.calendar.selectedCalendars, {
    method: 'PUT',
    body: JSON.stringify({ calendarIds }),
  }, intendedAccountId))
}

export async function setCalendarAutoSync(
  enabled: boolean,
  intendedAccountId: string | null,
): Promise<ServerActionResult<unknown>> {
  return wrapServerAction(() => serverAuthMutate(API.calendar.autoSync, {
    method: 'PUT',
    body: JSON.stringify({ enabled }),
  }, intendedAccountId))
}

export async function runCalendarSyncNow(
  intendedAccountId: string | null,
): Promise<ServerActionResult<unknown>> {
  return wrapServerAction(
    () => serverAuthMutate(API.calendar.autoSyncRun, { method: 'POST' }, intendedAccountId),
  )
}

export async function dismissCalendarSuggestion(
  suggestionId: string,
  intendedAccountId: string | null,
): Promise<ServerActionResult<void>> {
  return wrapServerAction(() => serverAuthMutate(
    API.calendar.autoSyncDismissSuggestion(suggestionId),
    { method: 'PUT' },
    intendedAccountId,
  ))
}

export async function dismissCalendarImport(
  intendedAccountId: string | null,
): Promise<ServerActionResult<void>> {
  return wrapServerAction(
    () => serverAuthMutate(API.calendar.dismiss, { method: 'PUT' }, intendedAccountId),
  )
}

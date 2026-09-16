'use server'

import { API } from '@orbit/shared/api'
import { serverAuthFetch } from '@/lib/server-fetch'
import { wrapServerAction, type ServerActionResult } from './action-result'

export async function getUserCalendars(): Promise<ServerActionResult<unknown>> {
  return wrapServerAction(() => serverAuthFetch(API.calendar.calendars, { method: 'GET' }))
}

export async function setSelectedCalendars(
  calendarIds: string[],
): Promise<ServerActionResult<unknown>> {
  return wrapServerAction(() => serverAuthFetch(API.calendar.selectedCalendars, {
    method: 'PUT',
    body: JSON.stringify({ calendarIds }),
  }))
}

export async function setCalendarAutoSync(
  enabled: boolean,
): Promise<ServerActionResult<unknown>> {
  return wrapServerAction(() => serverAuthFetch(API.calendar.autoSync, {
    method: 'PUT',
    body: JSON.stringify({ enabled }),
  }))
}

export async function runCalendarSyncNow(): Promise<ServerActionResult<unknown>> {
  return wrapServerAction(() => serverAuthFetch(API.calendar.autoSyncRun, { method: 'POST' }))
}

export async function dismissCalendarSuggestion(
  suggestionId: string,
): Promise<ServerActionResult<void>> {
  return wrapServerAction(() => serverAuthFetch(
    API.calendar.autoSyncDismissSuggestion(suggestionId),
    { method: 'PUT' },
  ))
}

export async function dismissCalendarImport(): Promise<ServerActionResult<void>> {
  return wrapServerAction(() => serverAuthFetch(API.calendar.dismiss, { method: 'PUT' }))
}

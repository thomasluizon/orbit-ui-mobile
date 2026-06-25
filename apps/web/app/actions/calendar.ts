'use server'

import { API } from '@orbit/shared/api'
import { serverAuthFetch } from '@/lib/server-fetch'

export async function getUserCalendars(): Promise<unknown> {
  return serverAuthFetch(API.calendar.calendars, { method: 'GET' })
}

export async function setSelectedCalendars(calendarIds: string[]): Promise<unknown> {
  return serverAuthFetch(API.calendar.selectedCalendars, {
    method: 'PUT',
    body: JSON.stringify({ calendarIds }),
  })
}

export async function setCalendarAutoSync(enabled: boolean): Promise<unknown> {
  return serverAuthFetch(API.calendar.autoSync, {
    method: 'PUT',
    body: JSON.stringify({ enabled }),
  })
}

export async function runCalendarSyncNow(): Promise<unknown> {
  return serverAuthFetch(API.calendar.autoSyncRun, { method: 'POST' })
}

export async function dismissCalendarSuggestion(suggestionId: string): Promise<void> {
  await serverAuthFetch(API.calendar.autoSyncDismissSuggestion(suggestionId), { method: 'PUT' })
}

export async function dismissCalendarImport(): Promise<void> {
  await serverAuthFetch(API.calendar.dismiss, { method: 'PUT' })
}

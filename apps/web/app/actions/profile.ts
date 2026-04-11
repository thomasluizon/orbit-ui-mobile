'use server'

import type {
  UpdateTimezoneRequest,
  SetLanguageRequest,
  SetAiMemoryRequest,
  SetAiSummaryRequest,
  SetWeekStartDayRequest,
  SetThemePreferenceRequest,
  SetColorSchemeRequest,
} from '@orbit/shared'
import { serverAuthFetch } from '@/lib/server-fetch'

export async function updateTimezone(data: UpdateTimezoneRequest): Promise<void> {
  await serverAuthFetch('/api/profile/timezone', {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export async function updateLanguage(data: SetLanguageRequest): Promise<void> {
  await serverAuthFetch('/api/profile/language', {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export async function updateAiMemory(data: SetAiMemoryRequest): Promise<void> {
  await serverAuthFetch('/api/profile/ai-memory', {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export async function updateAiSummary(data: SetAiSummaryRequest): Promise<void> {
  await serverAuthFetch('/api/profile/ai-summary', {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export async function updateWeekStartDay(data: SetWeekStartDayRequest): Promise<void> {
  await serverAuthFetch('/api/profile/week-start-day', {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export async function updateThemePreference(data: SetThemePreferenceRequest): Promise<void> {
  await serverAuthFetch('/api/profile/theme-preference', {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export async function updateColorScheme(data: SetColorSchemeRequest): Promise<void> {
  await serverAuthFetch('/api/profile/color-scheme', {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export async function completeOnboarding(): Promise<void> {
  await serverAuthFetch('/api/profile/onboarding', {
    method: 'PUT',
  })
}

export async function completeTour(): Promise<void> {
  await serverAuthFetch('/api/profile/tour', {
    method: 'PUT',
  })
}

export async function resetTour(): Promise<void> {
  await serverAuthFetch('/api/profile/tour', {
    method: 'DELETE',
  })
}

export async function resetAccount(): Promise<void> {
  await serverAuthFetch('/api/profile/reset', {
    method: 'POST',
  })
}

export async function dismissCalendarImport(): Promise<void> {
  await serverAuthFetch('/api/calendar/dismiss', {
    method: 'PUT',
  })
}

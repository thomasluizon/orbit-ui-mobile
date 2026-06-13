'use server'

import type {
  UpdateTimezoneRequest,
  SetNameRequest,
  SetLanguageRequest,
  SetAiMemoryRequest,
  SetAiSummaryRequest,
  SetWeekStartDayRequest,
  SetThemePreferenceRequest,
  SetColorSchemeRequest,
  UserDataExport,
} from '@orbit/shared'
import { API } from '@orbit/shared/api'
import { serverAuthFetch } from '@/lib/server-fetch'

export async function updateName(data: SetNameRequest): Promise<void> {
  await serverAuthFetch(API.profile.name, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export async function updateTimezone(data: UpdateTimezoneRequest): Promise<void> {
  await serverAuthFetch(API.profile.timezone, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export async function updateLanguage(data: SetLanguageRequest): Promise<void> {
  await serverAuthFetch(API.profile.language, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export async function updateAiMemory(data: SetAiMemoryRequest): Promise<void> {
  await serverAuthFetch(API.profile.aiMemory, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export async function updateAiSummary(data: SetAiSummaryRequest): Promise<void> {
  await serverAuthFetch(API.profile.aiSummary, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export async function updateWeekStartDay(data: SetWeekStartDayRequest): Promise<void> {
  await serverAuthFetch(API.profile.weekStartDay, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export async function updateThemePreference(data: SetThemePreferenceRequest): Promise<void> {
  await serverAuthFetch(API.profile.themePreference, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export async function updateColorScheme(data: SetColorSchemeRequest): Promise<void> {
  await serverAuthFetch(API.profile.colorScheme, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export async function completeOnboarding(): Promise<void> {
  await serverAuthFetch(API.profile.onboarding, {
    method: 'PUT',
  })
}

export async function completeTour(): Promise<void> {
  await serverAuthFetch(API.profile.tour, {
    method: 'PUT',
  })
}

export async function resetTour(): Promise<void> {
  await serverAuthFetch(API.profile.tour, {
    method: 'DELETE',
  })
}

export async function resetAccount(): Promise<void> {
  await serverAuthFetch(API.profile.reset, {
    method: 'POST',
  })
}

export async function exportUserData(): Promise<UserDataExport> {
  return serverAuthFetch<UserDataExport>(API.profile.export, {
    method: 'GET',
  })
}

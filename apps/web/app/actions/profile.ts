'use server'

import type {
  UpdateTimezoneRequest,
  SetNameRequest,
  SetLanguageRequest,
  SetAiSummaryRequest,
  SetProactiveAstraRequest,
  SetMarketingEmailConsentRequest,
  SetWeekStartDayRequest,
  SetThemePreferenceRequest,
  SetColorSchemeRequest,
  UserDataExport,
} from '@orbit/shared'
import { API } from '@orbit/shared/api'
import { serverAuthFetch } from '@/lib/server-fetch'
import { wrapServerAction, type ServerActionResult } from './action-result'

export async function updateName(data: SetNameRequest): Promise<ServerActionResult<void>> {
  return wrapServerAction(() => serverAuthFetch(API.profile.name, {
    method: 'PUT',
    body: JSON.stringify(data),
  }))
}

export async function updateTimezone(
  data: UpdateTimezoneRequest,
): Promise<ServerActionResult<void>> {
  return wrapServerAction(() => serverAuthFetch(API.profile.timezone, {
    method: 'PUT',
    body: JSON.stringify(data),
  }))
}

export async function updateLanguage(
  data: SetLanguageRequest,
): Promise<ServerActionResult<void>> {
  return wrapServerAction(() => serverAuthFetch(API.profile.language, {
    method: 'PUT',
    body: JSON.stringify(data),
  }))
}

export async function updateAiSummary(
  data: SetAiSummaryRequest,
): Promise<ServerActionResult<void>> {
  return wrapServerAction(() => serverAuthFetch(API.profile.aiSummary, {
    method: 'PUT',
    body: JSON.stringify(data),
  }))
}

export async function updateProactiveAstra(
  data: SetProactiveAstraRequest,
): Promise<ServerActionResult<void>> {
  return wrapServerAction(() => serverAuthFetch(API.profile.proactiveAstra, {
    method: 'PUT',
    body: JSON.stringify(data),
  }))
}

export async function updateMarketingConsent(
  data: SetMarketingEmailConsentRequest,
): Promise<ServerActionResult<void>> {
  return wrapServerAction(() => serverAuthFetch(API.profile.marketingConsent, {
    method: 'PUT',
    body: JSON.stringify(data),
  }))
}

export async function updateWeekStartDay(
  data: SetWeekStartDayRequest,
): Promise<ServerActionResult<void>> {
  return wrapServerAction(() => serverAuthFetch(API.profile.weekStartDay, {
    method: 'PUT',
    body: JSON.stringify(data),
  }))
}

export async function updateThemePreference(
  data: SetThemePreferenceRequest,
): Promise<ServerActionResult<void>> {
  return wrapServerAction(() => serverAuthFetch(API.profile.themePreference, {
    method: 'PUT',
    body: JSON.stringify(data),
  }))
}

export async function updateColorScheme(
  data: SetColorSchemeRequest,
): Promise<ServerActionResult<void>> {
  return wrapServerAction(() => serverAuthFetch(API.profile.colorScheme, {
    method: 'PUT',
    body: JSON.stringify(data),
  }))
}

export async function completeOnboarding(): Promise<ServerActionResult<void>> {
  return wrapServerAction(() => serverAuthFetch(API.profile.onboarding, {
    method: 'PUT',
  }))
}

export async function completeTour(): Promise<ServerActionResult<void>> {
  return wrapServerAction(() => serverAuthFetch(API.profile.tour, {
    method: 'PUT',
  }))
}

export async function resetTour(): Promise<ServerActionResult<void>> {
  return wrapServerAction(() => serverAuthFetch(API.profile.tour, {
    method: 'DELETE',
  }))
}

export async function resetAccount(): Promise<ServerActionResult<void>> {
  return wrapServerAction(() => serverAuthFetch(API.profile.reset, {
    method: 'POST',
  }))
}

export async function exportUserData(): Promise<ServerActionResult<UserDataExport>> {
  return wrapServerAction(() => serverAuthFetch<UserDataExport>(API.profile.export, {
    method: 'GET',
  }))
}

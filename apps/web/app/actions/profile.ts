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
import { serverAuthFetch, serverAuthMutate } from '@/lib/server-fetch'
import { wrapServerAction, type ServerActionResult } from './action-result'

export async function updateName(
  data: SetNameRequest,
  intendedAccountId: string | null,
): Promise<ServerActionResult<void>> {
  return wrapServerAction(() => serverAuthMutate(API.profile.name, {
    method: 'PUT',
    body: JSON.stringify(data),
  }, intendedAccountId))
}

export async function updateTimezone(
  data: UpdateTimezoneRequest,
  intendedAccountId: string | null,
): Promise<ServerActionResult<void>> {
  return wrapServerAction(() => serverAuthMutate(API.profile.timezone, {
    method: 'PUT',
    body: JSON.stringify(data),
  }, intendedAccountId))
}

export async function updateLanguage(
  data: SetLanguageRequest,
  intendedAccountId: string | null,
): Promise<ServerActionResult<void>> {
  return wrapServerAction(() => serverAuthMutate(API.profile.language, {
    method: 'PUT',
    body: JSON.stringify(data),
  }, intendedAccountId))
}

export async function updateAiSummary(
  data: SetAiSummaryRequest,
  intendedAccountId: string | null,
): Promise<ServerActionResult<void>> {
  return wrapServerAction(() => serverAuthMutate(API.profile.aiSummary, {
    method: 'PUT',
    body: JSON.stringify(data),
  }, intendedAccountId))
}

export async function updateProactiveAstra(
  data: SetProactiveAstraRequest,
  intendedAccountId: string | null,
): Promise<ServerActionResult<void>> {
  return wrapServerAction(() => serverAuthMutate(API.profile.proactiveAstra, {
    method: 'PUT',
    body: JSON.stringify(data),
  }, intendedAccountId))
}

export async function updateMarketingConsent(
  data: SetMarketingEmailConsentRequest,
  intendedAccountId: string | null,
): Promise<ServerActionResult<void>> {
  return wrapServerAction(() => serverAuthMutate(API.profile.marketingConsent, {
    method: 'PUT',
    body: JSON.stringify(data),
  }, intendedAccountId))
}

export async function updateWeekStartDay(
  data: SetWeekStartDayRequest,
  intendedAccountId: string | null,
): Promise<ServerActionResult<void>> {
  return wrapServerAction(() => serverAuthMutate(API.profile.weekStartDay, {
    method: 'PUT',
    body: JSON.stringify(data),
  }, intendedAccountId))
}

export async function updateThemePreference(
  data: SetThemePreferenceRequest,
  intendedAccountId: string | null,
): Promise<ServerActionResult<void>> {
  return wrapServerAction(() => serverAuthMutate(API.profile.themePreference, {
    method: 'PUT',
    body: JSON.stringify(data),
  }, intendedAccountId))
}

export async function updateColorScheme(
  data: SetColorSchemeRequest,
  intendedAccountId: string | null,
): Promise<ServerActionResult<void>> {
  return wrapServerAction(() => serverAuthMutate(API.profile.colorScheme, {
    method: 'PUT',
    body: JSON.stringify(data),
  }, intendedAccountId))
}

export async function completeOnboarding(
  intendedAccountId: string | null,
): Promise<ServerActionResult<void>> {
  return wrapServerAction(() => serverAuthMutate(API.profile.onboarding, {
    method: 'PUT',
  }, intendedAccountId))
}

export async function resetAccount(
  intendedAccountId: string | null,
): Promise<ServerActionResult<void>> {
  return wrapServerAction(() => serverAuthMutate(API.profile.reset, {
    method: 'POST',
  }, intendedAccountId))
}

export async function exportUserData(): Promise<ServerActionResult<UserDataExport>> {
  return wrapServerAction(() => serverAuthFetch<UserDataExport>(API.profile.export, {
    method: 'GET',
  }))
}

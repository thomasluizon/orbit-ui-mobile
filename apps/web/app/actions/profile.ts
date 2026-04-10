'use server'

import { getAuthHeaders } from '@/lib/auth-api'
import type {
  UpdateTimezoneRequest,
  SetLanguageRequest,
  SetAiMemoryRequest,
  SetAiSummaryRequest,
  SetWeekStartDayRequest,
  SetThemePreferenceRequest,
  SetColorSchemeRequest,
} from '@orbit/shared'

const API_BASE = process.env.API_BASE ?? 'http://localhost:5000'

async function authFetch(path: string, init: RequestInit) {
  const headers = await getAuthHeaders()
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { ...headers, 'Content-Type': 'application/json', ...init.headers },
  })
  if (!res.ok) {
    const error = await res.json().catch(() => null)
    throw new Error(error?.error ?? error?.message ?? `Failed with status ${res.status}`)
  }
  if (res.status === 204) return null
  const text = await res.text()
  if (!text) return null
  return JSON.parse(text)
}

export async function updateTimezone(data: UpdateTimezoneRequest): Promise<void> {
  await authFetch('/api/profile/timezone', {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export async function updateLanguage(data: SetLanguageRequest): Promise<void> {
  await authFetch('/api/profile/language', {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export async function updateAiMemory(data: SetAiMemoryRequest): Promise<void> {
  await authFetch('/api/profile/ai-memory', {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export async function updateAiSummary(data: SetAiSummaryRequest): Promise<void> {
  await authFetch('/api/profile/ai-summary', {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export async function updateWeekStartDay(data: SetWeekStartDayRequest): Promise<void> {
  await authFetch('/api/profile/week-start-day', {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export async function updateThemePreference(data: SetThemePreferenceRequest): Promise<void> {
  await authFetch('/api/profile/theme-preference', {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export async function updateColorScheme(data: SetColorSchemeRequest): Promise<void> {
  await authFetch('/api/profile/color-scheme', {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export async function completeOnboarding(): Promise<void> {
  await authFetch('/api/profile/onboarding', {
    method: 'PUT',
  })
}

export async function completeTour(): Promise<void> {
  await authFetch('/api/profile/tour', {
    method: 'PUT',
  })
}

export async function resetTour(): Promise<void> {
  await authFetch('/api/profile/tour', {
    method: 'DELETE',
  })
}

export async function resetAccount(): Promise<void> {
  await authFetch('/api/profile/reset', {
    method: 'POST',
  })
}

export async function dismissCalendarImport(): Promise<void> {
  await authFetch('/api/calendar/dismiss', {
    method: 'PUT',
  })
}

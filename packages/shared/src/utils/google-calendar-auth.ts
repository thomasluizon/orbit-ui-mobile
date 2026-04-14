export const GOOGLE_CALENDAR_READONLY_SCOPE = 'https://www.googleapis.com/auth/calendar.readonly'

export const GOOGLE_CALENDAR_OAUTH_QUERY_PARAMS = {
  access_type: 'offline',
  include_granted_scopes: 'true',
} as const

export const GOOGLE_CALENDAR_CONSENT_QUERY_PARAMS = {
  ...GOOGLE_CALENDAR_OAUTH_QUERY_PARAMS,
  prompt: 'consent',
} as const

interface GoogleCalendarOAuthOptionsInput {
  redirectTo: string
  skipBrowserRedirect?: boolean
  forceConsent?: boolean
}

export function buildGoogleCalendarOAuthOptions({
  redirectTo,
  skipBrowserRedirect = false,
  forceConsent = false,
}: Readonly<GoogleCalendarOAuthOptionsInput>) {
  return {
    redirectTo,
    scopes: GOOGLE_CALENDAR_READONLY_SCOPE,
    ...(skipBrowserRedirect ? { skipBrowserRedirect: true } : {}),
    queryParams: forceConsent
      ? GOOGLE_CALENDAR_CONSENT_QUERY_PARAMS
      : GOOGLE_CALENDAR_OAUTH_QUERY_PARAMS,
  }
}

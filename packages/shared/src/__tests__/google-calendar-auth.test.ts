import { describe, expect, it } from 'vitest'
import {
  buildGoogleCalendarOAuthOptions,
  GOOGLE_CALENDAR_CONSENT_QUERY_PARAMS,
  GOOGLE_CALENDAR_OAUTH_QUERY_PARAMS,
  GOOGLE_CALENDAR_READONLY_SCOPE,
} from '../utils/google-calendar-auth'

describe('google calendar auth helpers', () => {
  it('builds default oauth options without forcing consent', () => {
    expect(
      buildGoogleCalendarOAuthOptions({
        redirectTo: 'https://app.useorbit.org/auth-callback',
      }),
    ).toEqual({
      redirectTo: 'https://app.useorbit.org/auth-callback',
      scopes: GOOGLE_CALENDAR_READONLY_SCOPE,
      queryParams: GOOGLE_CALENDAR_OAUTH_QUERY_PARAMS,
    })
  })

  it('adds forced consent params for calendar reconnect flows', () => {
    expect(
      buildGoogleCalendarOAuthOptions({
        redirectTo: 'https://app.useorbit.org/auth-callback',
        forceConsent: true,
      }),
    ).toEqual({
      redirectTo: 'https://app.useorbit.org/auth-callback',
      scopes: GOOGLE_CALENDAR_READONLY_SCOPE,
      queryParams: GOOGLE_CALENDAR_CONSENT_QUERY_PARAMS,
    })
  })

  it('preserves skipBrowserRedirect for native oauth flows', () => {
    expect(
      buildGoogleCalendarOAuthOptions({
        redirectTo: 'orbit://auth-callback',
        skipBrowserRedirect: true,
      }),
    ).toEqual({
      redirectTo: 'orbit://auth-callback',
      scopes: GOOGLE_CALENDAR_READONLY_SCOPE,
      skipBrowserRedirect: true,
      queryParams: GOOGLE_CALENDAR_OAUTH_QUERY_PARAMS,
    })
  })
})

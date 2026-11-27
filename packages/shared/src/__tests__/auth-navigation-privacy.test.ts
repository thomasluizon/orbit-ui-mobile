import { describe, expect, it } from 'vitest'
import { scrubAuthNavigation } from '../utils/auth-navigation-privacy'

describe('scrubAuthNavigation', () => {
  it('removes sign-in queries and stream tickets from each place of an event', () => {
    const link = 'https://app.example.test/auth-callback?code=private-code'
    const event = scrubAuthNavigation({
      transaction: '/login?code=private-code',
      request: { url: link, query_string: 'code=private-code', headers: { Referer: link } },
      breadcrumbs: [
        { message: `Opening ${link}` },
        { data: { to: '/api/events?ticket=private-ticket&cursor=next', status_code: 200 } },
      ],
    })

    expect(event).toEqual({
      transaction: '/login',
      request: { url: 'https://app.example.test/auth-callback', headers: { Referer: 'https://app.example.test/auth-callback' } },
      breadcrumbs: [
        { message: 'Opening https://app.example.test/auth-callback' },
        { data: { to: '/api/events?ticket=[Filtered]&cursor=next', status_code: 200 } },
      ],
    })
  })

  it.each([{}, { request: {} }, { breadcrumbs: [{}] }])('adds nothing to an event with no link: %o', (event) => {
    const before = structuredClone(event)

    expect(scrubAuthNavigation(event)).toEqual(before)
  })
})

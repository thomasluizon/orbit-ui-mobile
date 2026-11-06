import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import nextConfig from '../next.config'

const APPLE_TEAM_ID_PREFIX = 'BD7JH468F7'

describe('Apple app associations', () => {
  it('associates only authentication callbacks and referrals with both variants of the enrolled team', () => {
    const association = JSON.parse(readFileSync(
      resolve(__dirname, '../public/.well-known/apple-app-site-association'), 'utf8',
    )) as unknown
    const appIds = [`${APPLE_TEAM_ID_PREFIX}.org.useorbit.app`, `${APPLE_TEAM_ID_PREFIX}.org.useorbit.app.staging`]
    expect(association).toEqual({
      applinks: { apps: [], details: appIds.map((appID) => ({ appID, paths: ['/auth-callback', '/r/*'] })) },
      webcredentials: { apps: appIds },
    })
  })

  it('serves the extensionless association as JSON', async () => {
    const headers = await nextConfig.headers?.()
    expect(headers).toContainEqual({
      source: '/.well-known/apple-app-site-association',
      headers: [{ key: 'Content-Type', value: 'application/json' }],
    })
  })
})

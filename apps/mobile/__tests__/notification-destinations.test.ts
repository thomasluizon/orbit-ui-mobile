import { readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { getNotificationDestination } from '@orbit/shared/utils'

/** Values from orbit-api/src/Orbit.Application/Notifications/NotificationUrls.cs. */
const notificationUrls = [
  '/',
  '/progress',
  '/chat',
  '/profile',
  '/calendar-sync',
  '/calendar-sync?mode=review',
  '/progress?wrapped=month&year=2026&month=8',
]

const routes = readdirSync(resolve(__dirname, '../app'), { recursive: true, encoding: 'utf8' })
  .filter((file) => file.endsWith('.tsx'))
  .map((file) => file.replace(/(^|\/)\([^/]+\)\//g, '$1'))
  .filter((file) => file === 'index.tsx' || file.endsWith('/index.tsx') || !file.includes('/'))
  .map((file) => file.replace(/(^|\/)index\.tsx$/, '').replace(/\.tsx$/, '') || '/')
  .map((file) => file.startsWith('/') ? file : `/${file}`)

describe('notification destinations', () => {
  it.each(notificationUrls)('%s resolves to an Android screen', (url) => {
    const destination = getNotificationDestination(url)
    expect(destination).not.toBeNull()
    expect(routes).toContain(destination?.url.split('?')[0])
  })
})

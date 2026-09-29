/**
 * Orbit Web Push worker. It shows each push from the API and hands a notification click to the app,
 * which picks the destination with the shared notification rule. It has no fetch handler and caches
 * nothing. `apps/web/__tests__/service-worker.test.ts` is its guard, because ESLint ignores `public/`.
 */

const NOTIFICATION_ICON = '/pwa-192x192.png'

/** The API sends `{ title, body, url? }`. A push that does not match still needs a visible notification. */
function readPushPayload(data) {
  let payload = null
  try {
    payload = data ? data.json() : null
  } catch {
    payload = null
  }
  return payload && typeof payload.title === 'string' ? payload : { title: 'Orbit' }
}

function findOrbitWindows() {
  return self.clients.matchAll({ type: 'window', includeUncontrolled: true })
}

self.addEventListener('push', (event) => {
  const payload = readPushPayload(event.data)
  const options = { icon: NOTIFICATION_ICON, data: {} }
  if (typeof payload.body === 'string') options.body = payload.body
  if (typeof payload.url === 'string') options.data.url = payload.url

  event.waitUntil(
    Promise.all([
      self.registration.showNotification(payload.title, options),
      findOrbitWindows().then((windows) => {
        for (const client of windows) client.postMessage({ type: 'orbit:push-received' })
      }),
    ]),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data.url

  event.waitUntil(
    findOrbitWindows().then((windows) => {
      const client = windows[0]
      if (!client) {
        return self.clients.openWindow(url ? `/?notificationUrl=${encodeURIComponent(url)}` : '/')
      }
      if (url) client.postMessage({ type: 'orbit:notification-click', url })
      return client.focus()
    }),
  )
})

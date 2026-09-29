/**
 * Orbit Web Push worker. It shows each push from the API and hands a notification click to the app,
 * which picks the destination with the shared notification rule. It has no fetch handler and caches
 * nothing. `apps/web/__tests__/service-worker.test.ts` is its guard, because ESLint ignores `public/`.
 */

const NOTIFICATION_ICON = '/pwa-192x192.png'

/**
 * How long a window gets to confirm it took a click. A login page or a page still loading has no
 * listener, so the worker then loads the launch link in that window instead.
 */
const CLICK_RECEIPT_TIMEOUT_MS = 1000

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

/** The app reads this link on load, and the proxy keeps its parameter on the way to `/login`. */
function launchUrl(url) {
  return url ? `/?notificationUrl=${encodeURIComponent(url)}` : '/'
}

/** Resolves true once the window's app confirms the click on the reply port it gets with it. */
function handClickToWindow(client, url) {
  const channel = new MessageChannel()
  const receipt = new Promise((resolve) => {
    channel.port1.onmessage = () => resolve(true)
    setTimeout(() => resolve(false), CLICK_RECEIPT_TIMEOUT_MS)
  })
  client.postMessage({ type: 'orbit:notification-click', url }, [channel.port2])
  return receipt.finally(() => channel.port1.close())
}

/**
 * Picks among the windows this worker controls, the only ones `navigate` accepts. Claiming on activate
 * brings every window that was already open under control.
 */
async function openNotification(url) {
  const [client] = await self.clients.matchAll({ type: 'window' })
  if (!client) return self.clients.openWindow(launchUrl(url))
  const focused = await client.focus()
  if (url && !(await handClickToWindow(focused, url))) await focused.navigate(launchUrl(url))
}

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

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
  event.waitUntil(openNotification(event.notification.data.url))
})

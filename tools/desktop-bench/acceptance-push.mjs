import { createPrivateKey, randomUUID, sign } from 'node:crypto'
import { connect } from 'node:http2'
import { assertDoneDelivered, assertExpiredDone, visibleWindows } from './acceptance-contract.mjs'

// Producers: orbit-api ReminderSchedulerService.Repeat.cs RecordRepeat, PushNotificationService.CreateWebPushPayload,
// ApnsPushSender (CreatePayload, SendAsync, GetProviderToken), WnsPushSender and WnsEndpointPolicy (#1861).
export const repeatCategory = 'orbit-repeat-reminder'
const wnsScope = 'https://wns.windows.com/.default'
const credentialNames = {
  wns: ['ORBIT_WNS_TENANT_ID', 'ORBIT_WNS_CLIENT_ID', 'ORBIT_WNS_CLIENT_SECRET'],
  apns: ['ORBIT_APNS_KEY_ID', 'ORBIT_APPLE_TEAM_ID', 'ORBIT_APNS_PRIVATE_KEY'],
}

export function takePushCredentials(environment) {
  const credentials = {}
  for (const name of Object.values(credentialNames).flat()) {
    if (environment[name]) credentials[name] = environment[name]
    delete environment[name]
  }
  return credentials
}

function roundTripTimestamp(date) {
  return date.toISOString().replace(/\.(\d{3})Z$/, '.$10000Z')
}

function clockTime(date, timeZone) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone })
    .formatToParts(date).map(({ type, value }) => [type, value]))
  return `${parts.hour}:${parts.minute} ${parts.dayPeriod}`
}

export function repeatReminder({ habitId, title, doneToken, reminderAt, timeZone, intervalMinutes = 60 }) {
  const expiresAt = new Date(reminderAt.getTime() + intervalMinutes * 60000)
  return {
    title, body: `Next at ${clockTime(expiresAt, timeZone)}`, url: '/',
    data: {
      habitId, tag: `orbit-repeat-${habitId.replaceAll('-', '')}`, reminderAtUtc: roundTripTimestamp(reminderAt),
      doneExpiresAtUtc: roundTripTimestamp(expiresAt), doneToken, doneLabel: 'Done',
    },
  }
}

export function wnsPayload({ title, body, url, data }) {
  return JSON.stringify({ title, body, ...data, url })
}

export function apnsPayload({ title, body, url, data }) {
  return { aps: { alert: { title, body }, sound: 'default', category: repeatCategory }, body: { ...data, url } }
}

export function isWnsChannel(channel) {
  let uri
  try { uri = new URL(channel) } catch { return false }
  return uri.protocol === 'https:' && uri.port === '' && !uri.username && !uri.password && !uri.hash &&
    (uri.hostname === 'notify.windows.com' || uri.hostname.endsWith('.notify.windows.com'))
}

export async function wnsAccessToken({ tenantId, clientId, clientSecret }, request = fetch) {
  const response = await request(`https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret, scope: wnsScope }).toString(),
  })
  if (!response.ok) throw new Error(`WNS authentication failed: HTTP ${response.status}`)
  const reply = await response.json()
  if (typeof reply?.access_token !== 'string' || !reply.access_token.trim()) throw new Error('WNS authentication returned no access token')
  return reply.access_token
}

export async function sendWns(channel, payload, accessToken, request = fetch) {
  if (!isWnsChannel(channel)) throw new Error('The registered Windows channel is not a WNS endpoint')
  const response = await request(channel, {
    method: 'POST', headers: { authorization: `Bearer ${accessToken}`, 'x-wns-type': 'wns/raw', 'content-type': 'application/octet-stream' },
    body: Buffer.from(payload, 'utf8'),
  })
  if (response.status !== 200) throw new Error(`WNS delivery failed: HTTP ${response.status}`)
  return { status: response.status }
}

export function apnsProviderToken({ keyId, teamId, privateKey }, issuedAt = Math.floor(Date.now() / 1000)) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url')
  const content = `${encode({ alg: 'ES256', kid: keyId })}.${encode({ iss: teamId, iat: issuedAt })}`
  const signature = sign('sha256', Buffer.from(content), { key: createPrivateKey(privateKey), dsaEncoding: 'ieee-p1363' })
  return `${content}.${signature.toString('base64url')}`
}

export function apnsRequest({ deviceToken, topic, environment, reminder, providerToken }) {
  const hosts = { development: 'api.sandbox.push.apple.com', production: 'api.push.apple.com' }
  if (!Object.hasOwn(hosts, environment)) throw new Error(`Unknown APNs environment: ${environment}`)
  const path = `/3/device/${encodeURIComponent(deviceToken)}`
  return {
    origin: `https://${hosts[environment]}`,
    headers: { ':method': 'POST', ':path': path, authorization: `bearer ${providerToken}`, 'apns-topic': topic,
      'apns-push-type': 'alert', 'apns-collapse-id': reminder.data.tag, 'content-type': 'application/json' },
    body: JSON.stringify(apnsPayload(reminder)),
  }
}

export async function sendApns({ origin, headers, body }, connectTo = connect) {
  const session = connectTo(origin)
  try {
    const { status, reply } = await new Promise((resolve, reject) => {
      session.on('error', reject)
      const stream = session.request(headers)
      let status = 0
      let reply = ''
      stream.setEncoding('utf8')
      stream.on('response', (responseHeaders) => { status = responseHeaders[':status'] })
      stream.on('data', (chunk) => { reply += chunk })
      stream.on('end', () => resolve({ status, reply }))
      stream.on('error', reject)
      stream.end(body)
    })
    if (status !== 200) {
      let reason = ''
      try { reason = JSON.parse(reply).reason ?? '' } catch { reason = '' }
      throw new Error(`APNs delivery failed: HTTP ${status}${reason ? ` ${reason}` : ''}`)
    }
    return { status }
  } finally {
    session.close()
  }
}

export function apsEnvironment(entitlements) {
  return /<key>com\.apple\.developer\.aps-environment<\/key>\s*<string>(development|production)<\/string>/.exec(entitlements)?.[1] ?? null
}

export function pushReadiness({ platform, credentials, environment }) {
  const transport = platform === 'win32' ? 'wns' : 'apns'
  if (transport === 'apns' && !environment) {
    return { transport, registration: false, delivery: false,
      skipped: 'APNs acceptance skipped: the installed shell has no com.apple.developer.aps-environment entitlement. ' +
        'The acceptance build is unsigned until Developer ID signing (ui#2364) reaches it.' }
  }
  const missing = credentialNames[transport].filter((name) => !credentials[name])
  if (missing.length) {
    return { transport, registration: true, delivery: false,
      skipped: `${transport.toUpperCase()} delivery skipped: the job has no ${missing.join(', ')}.` }
  }
  return { transport, registration: true, delivery: true }
}

export async function pushSender(transport, registration, credentials, environment) {
  if (transport === 'wns') {
    const accessToken = await wnsAccessToken({ tenantId: credentials.ORBIT_WNS_TENANT_ID, clientId: credentials.ORBIT_WNS_CLIENT_ID,
      clientSecret: credentials.ORBIT_WNS_CLIENT_SECRET })
    return (reminder) => sendWns(registration.endpoint, wnsPayload(reminder), accessToken)
  }
  const providerToken = apnsProviderToken({ keyId: credentials.ORBIT_APNS_KEY_ID, teamId: credentials.ORBIT_APPLE_TEAM_ID,
    privateKey: credentials.ORBIT_APNS_PRIVATE_KEY })
  return (reminder) => sendApns(apnsRequest({ deviceToken: registration.endpoint, topic: registration.apnsTopic, environment, reminder, providerToken }))
}

function describeRegistration({ endpoint, p256dh, apnsTopic, deviceId, receivedAtUtc }) {
  const host = p256dh === 'wns' ? new URL(endpoint).hostname : null
  return { p256dh, apnsTopic, deviceId, receivedAtUtc, ...(host ? { endpointHost: host } : { tokenLength: endpoint.length }) }
}

function skip(io, reason) {
  io.report.push.skipped = reason
  io.warn(reason)
}

async function enablePush(io, pid) {
  io.proxy.send(`push-enable:${JSON.stringify(io.labels)}`)
  // A first macOS request shows the system authorization alert, which only a person or the AX reader can allow.
  await io.waitFor(async () => {
    if (io.proxy.read('push-enabled')) return true
    if (io.platform === 'darwin') await io.native(pid, 'notification', { title: io.appName, label: io.allowLabel, invoke: true })
    return false
  }, 'the Perfil notification switch to register this device', 330000)
}

async function sendReminder(io, deliver, purpose) {
  const habitId = randomUUID()
  const doneToken = await io.mock.mintReminder(habitId)
  const reminder = repeatReminder({ habitId, title: `Orbit acceptance ${purpose} ${habitId.slice(0, 8)}`, doneToken,
    reminderAt: new Date(io.now() - 60000), timeZone: io.timeZone })
  io.report.push[`${purpose}Delivery`] = await deliver(reminder)
  return reminder
}

async function notification(io, pid, reminder, invoke) {
  const label = io.platform === 'darwin' ? io.doneLabel : reminder.data.doneLabel
  let reply
  const find = (openCenter) => {
    let open = openCenter
    return io.waitFor(async () => {
      reply = await io.native(pid, 'notification', { title: reminder.title, label, invoke, openCenter: open })
      open = false
      return reply?.found && reply
    }, `the ${reminder.title} system notification`, 20000)
  }
  try {
    return await find(false)
  } catch (error) {
    if (!error.message.startsWith('Timed out')) throw error
  }
  // A missed banner moves to the notification list; the reader opens it once before the final search.
  try {
    return await find(true)
  } catch (error) {
    await io.record(`notification-${reminder.title.split(' ')[2]}`, reply)
    throw error
  }
}

async function windowsOf(io, pid) {
  return visibleWindows(io.platform, await io.native(pid, 'windows'))
}

export async function exercisePush(io) {
  const readiness = pushReadiness({ platform: io.platform, credentials: io.credentials,
    environment: io.platform === 'darwin' ? await io.apsEnvironment() : null })
  io.report.push = { transport: readiness.transport }
  if (!readiness.registration) { skip(io, readiness.skipped); return }
  await io.mock.sessionMode('expiring')
  const shell = await io.launch()
  const pid = shell.child.pid
  await enablePush(io, pid)
  const registration = await io.waitFor(async () => (await io.mock.registrations()).findLast((entry) => entry.p256dh === readiness.transport),
    'the API to record the native push registration', 30000)
  io.report.push.registration = describeRegistration(registration)
  if (!readiness.delivery) {
    await io.stop(shell)
    skip(io, readiness.skipped)
    return
  }
  const deliver = await io.sender(readiness.transport, registration)
  await io.native(pid, 'close')
  await io.waitFor(async () => await windowsOf(io, pid) === 0, 'the main window to hide', 30000)
  const completed = await sendReminder(io, deliver, 'done')
  await notification(io, pid, completed, true)
  await io.waitFor(async () => (await io.mock.logs()).some((log) => log.habitId === completed.data.habitId), 'the Done habit log', 60000)
  // A second request would follow the shell's first response well inside this window.
  await io.delay(5000)
  io.report.push.done = assertDoneDelivered({ logs: await io.mock.logs(), habitId: completed.data.habitId, visible: await windowsOf(io, pid) })
  const expired = await sendReminder(io, deliver, 'expired')
  await notification(io, pid, expired, false)
  await io.stop(shell)
  await io.mock.sessionMode('expired')
  io.proxy.reset({ expectAuthenticated: false, reportSignIn: true })
  // The refreshed access token lives 65 seconds and the BFF refreshes inside 60, so 6 seconds make it due.
  await io.delay(6000)
  await notification(io, 0, expired, true)
  const signIn = await io.waitFor(() => io.proxy.read('sign-in'), 'the sign-in page after an expired-session Done', 120000)
  const launched = await io.waitFor(async () => (await io.findProcesses())[0], 'the notification-launched shell', 30000)
  io.adopt(launched)
  const visible = await io.waitFor(() => windowsOf(io, launched), 'the sign-in window to show', 30000)
  await io.delay(5000)
  io.report.push.expired = assertExpiredDone({ logs: await io.mock.logs(), habitId: expired.data.habitId, visible, signIn })
}

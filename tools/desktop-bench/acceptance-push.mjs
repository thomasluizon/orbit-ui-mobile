import { execFile } from 'node:child_process'
import { createPrivateKey, randomUUID, sign } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import { connect } from 'node:http2'
import { join } from 'node:path'
import { promisify } from 'node:util'
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

const apsKey = 'com.apple.developer.aps-environment'
export const unsignedReason = 'the job has no Developer ID signing material, because only a same-repository macOS job receives the desktop-staging environment'

// codesign exits 1 for an unsigned bundle and prints nothing for a signature without entitlements.
export function apsEnvironment({ status, stdout, stderr }, entitlements) {
  if (status !== 0 || !stdout.trim()) return null
  if (entitlements === null || typeof entitlements !== 'object' || Array.isArray(entitlements)) {
    throw new Error(`codesign entitlements output is not a parseable plist: stdout ${stdout.length} bytes starting ${JSON.stringify(stdout.slice(0, 120))}, ` +
      `stderr ${stderr.length} bytes starting ${JSON.stringify(stderr.slice(0, 120))}`)
  }
  if (!Object.hasOwn(entitlements, apsKey)) return null
  const value = entitlements[apsKey]
  if (value !== 'development' && value !== 'production') throw new Error(`codesign entitlements carry an unknown ${apsKey} value: ${JSON.stringify(value)}`)
  return value
}

async function capture(run, command, argumentsList) {
  try {
    const { stdout, stderr } = await run(command, argumentsList)
    return { status: 0, stdout, stderr }
  } catch (error) {
    // execFile gives a numeric code for a nonzero exit; a string code means the command did not start.
    if (typeof error.code !== 'number') throw error
    return { status: error.code, stdout: error.stdout ?? '', stderr: error.stderr ?? '' }
  }
}

export async function signedApsEnvironment(application, output, run = promisify(execFile)) {
  const signature = await capture(run, 'codesign', ['-d', '--entitlements', '-', '--xml', application])
  const stdoutPath = join(output, 'codesign-entitlements.stdout.log')
  await writeFile(stdoutPath, signature.stdout)
  await writeFile(join(output, 'codesign-entitlements.stderr.log'), signature.stderr)
  let entitlements
  if (signature.status === 0 && signature.stdout.trim()) {
    const converted = await capture(run, 'plutil', ['-convert', 'json', '-o', '-', stdoutPath])
    if (converted.status === 0) entitlements = JSON.parse(converted.stdout)
  }
  return { signature, environment: apsEnvironment(signature, entitlements) }
}

export function pushReadiness({ platform, credentials, environment, signed }) {
  const transport = platform === 'win32' ? 'wns' : 'apns'
  if (transport === 'apns' && !environment) {
    if (signed) throw new Error(`The Developer ID signed shell has no ${apsKey} entitlement; see codesign-entitlements.stdout.log`)
    return { transport, registration: false, delivery: false,
      skipped: `APNs acceptance skipped: the installed shell has no ${apsKey} entitlement because the acceptance build is unsigned: ${unsignedReason}.` }
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
  // The macos-latest image leaves apsd and Notification Center unloaded, so no alert presents and no token arrives until both run.
  if (io.platform === 'darwin') await io.startPushServices()
  io.proxy.send(`push-enable:${JSON.stringify(io.labels)}`)
  // A first macOS request shows the system authorization alert, which only a person or the AX reader can allow.
  // Each poll records the Notification Center tree, so every run carries a capture of the alert or of its absence. The alert
  // leaves the screen once allowed, so the poll that found it keeps its own capture and its outcome in the report.
  if (io.platform === 'darwin') io.report.push.authorization = { found: false }
  await io.waitFor(async () => {
    if (io.platform === 'darwin') {
      const reply = await io.native(pid, 'notification', { title: io.appName, label: io.allowLabel, invoke: true })
      await io.record('notification-authorization', reply)
      if (reply?.found && !io.report.push.authorization.found) {
        io.report.push.authorization = { found: true, invoked: reply.invoked, role: reply.role, action: reply.action }
        await io.record('notification-authorization-found', reply)
      }
    }
    return Boolean(io.proxy.read('push-enabled'))
  }, 'the Perfil notification switch to register this device', 330000)
}

// APNs answers 200 when it accepts a push, not when the device receives it. apsd counts every push it receives per topic,
// so the macOS phase waits for that count to rise before it looks for the notification. A missing notification then names
// the hop that dropped it: APNs to the device, or the device to Notification Center.
async function deviceReceipt(io, topic, before, purpose) {
  const sent = io.now()
  let last = before
  try {
    await io.waitFor(async () => {
      last = await io.apsdReceipt(topic)
      return last.count > before.count
    }, `apsd to receive the ${purpose} push`, 60000)
  } catch (error) {
    if (!error.message.startsWith('Timed out')) throw error
    io.report.push[`${purpose}Receipt`] = { before: before.count, after: last.count, last: last.last }
    throw new Error(`APNs accepted the ${purpose} reminder with HTTP 200, but apsd counted no new push for ${topic}: ` +
      `${before.count} before and ${last.count} after 60 s, last incoming push ${last.last ?? 'none'}`)
  }
  return { before: before.count, after: last.count, seconds: (io.now() - sent) / 1000 }
}

async function sendReminder(io, deliver, purpose) {
  const habitId = randomUUID()
  const doneToken = await io.mock.mintReminder(habitId)
  const reminder = repeatReminder({ habitId, title: `Orbit acceptance ${purpose} ${habitId.slice(0, 8)}`, doneToken,
    reminderAt: new Date(io.now() - 60000), timeZone: io.timeZone })
  const topic = io.platform === 'darwin' ? io.report.push.registration.apnsTopic : null
  const before = topic ? await io.apsdReceipt(topic) : null
  io.report.push[`${purpose}Delivery`] = await deliver(reminder)
  if (topic) io.report.push[`${purpose}Receipt`] = await deviceReceipt(io, topic, before, purpose)
  return reminder
}

async function notification(io, pid, reminder, invoke, name) {
  const label = io.platform === 'darwin' ? io.doneLabel : reminder.data.doneLabel
  const find = (openCenter) => {
    let open = openCenter
    return io.waitFor(async () => {
      const reply = await io.native(pid, 'notification', { title: reminder.title, label, invoke, openCenter: open, executable: io.executable })
      open = false
      // Every reply carries the platform tree, so the artifacts keep the last capture whether or not it matched.
      await io.record(name, reply)
      // Windows names the notification mode, and a Do not disturb mode holds banners back, so the toast waits in the center.
      if (reply?.notificationMode && !io.report.push.notificationMode) io.report.push.notificationMode = reply.notificationMode
      // The Windows reply reads the shell AUMID's notification history before any Done, so the last reply of a search says
      // whether the toast was posted at all.
      if (reply?.history) {
        io.report.push.history ??= {}
        io.report.push.history[name] = reply.history
      }
      return reply?.found && reply
    }, `the ${reminder.title} system notification`, 20000)
  }
  try {
    return await find(false)
  } catch (error) {
    if (!error.message.startsWith('Timed out')) throw error
  }
  // A missed banner moves to the notification list; the reader opens it once before the final search.
  return find(true)
}

// The Windows reader names the token level of each shell host and every running shell instance. Read with the shell's log
// line for a forwarded activation, it shows whether a toast click reached the running shell, started a second one, or
// reached neither.
async function activationEvidence(io, pid, name) {
  const reply = await io.native(pid, 'activation', { executable: io.executable })
  await io.record(name, reply)
  return {
    hosts: (reply?.hosts ?? []).map(({ name: host, integrity, elevated, error }) => ({ name: host, integrity, elevated, ...(error ? { error } : {}) })),
    instances: (reply?.instances ?? []).map(({ processId, commandLine, integrity }) => ({ processId, commandLine, integrity })),
  }
}

export function describeActivation({ hosts, instances }) {
  const levels = hosts.map(({ name, integrity, elevated, error }) => `${name} ${error ? `unreadable (${error})` : `${integrity}${elevated ? ' elevated' : ''}`}`)
  // Each shell's own level sits next to the host levels, because a toast click reaches the running shell only through a
  // COM activator registered under a token that matches the activating host's token.
  const shells = instances.map(({ processId, integrity }) => `pid ${processId} ${integrity ?? 'unreadable'}`)
  return `shell hosts: ${levels.join(', ') || 'none found'}; running shell instances: ${instances.length}${shells.length ? ` (${shells.join(', ')})` : ''}`
}

// The client's token must be the shell's token kind, because COM routes the call to the running shell's activator only for a
// client whose token matches the shell's token.
const tokenFields = ['sid', 'integrity', 'administrators', 'session']

export function activatorFailure(reply, shell) {
  const client = reply.context
  if (reply.error) return `the activator client failed: ${reply.error}`
  if (!client) return 'the activator client reported no token'
  const different = tokenFields.filter((field) => client[field] !== shell?.[field])
  if (different.length) {
    return `the activator client token differs from the shell token in ${different.map((field) => `${field} (${client[field]} against ${shell?.[field]})`).join(', ')}`
  }
  if (reply.hresult !== 0) return `INotificationActivationCallback::Activate returned 0x${(reply.hresult >>> 0).toString(16).toUpperCase().padStart(8, '0')}`
  return null
}

// A hosted runner's shell hosts run at High integrity, and COM never gives their toast click to the running Medium shell. Thus
// the Windows phase makes that click's Activate call from a Medium client with the shell's token (windows-unelevated.ps1).
async function activateDone(io, reminder, name) {
  const reply = await io.activate({ name, title: reminder.title, label: reminder.data.doneLabel })
  await io.record(name, reply)
  const shell = io.report.launchContexts?.push
  io.report.push.activator ??= {}
  io.report.push.activator[name] = { hresult: reply.hresult ?? null, clsid: reply.registration?.clsid ?? null, header: reply.header ?? null,
    argumentKeys: reply.argumentKeys ?? [], client: Object.fromEntries(tokenFields.map((field) => [field, reply.context?.[field] ?? null])),
    ...(reply.error ? { error: reply.error } : {}) }
  const failure = activatorFailure(reply, shell)
  if (!failure) return
  io.report.push.activatorFailure = await activationEvidence(io, 0, `${name}-failure`)
  throw new Error(`The ${reminder.title} Done activation failed: ${failure}; ${describeActivation(io.report.push.activatorFailure)}`)
}

async function windowsOf(io, pid) {
  return visibleWindows(io.platform, await io.native(pid, 'windows'))
}

export async function exercisePush(io) {
  const readiness = pushReadiness({ platform: io.platform, credentials: io.credentials, signed: io.signed,
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
  const windows = io.platform === 'win32'
  // On Windows the reader only proves that the toast shows with its Done button, and the activator client clicks Done.
  await notification(io, pid, completed, !windows, 'notification-done')
  if (windows) {
    await activateDone(io, completed, 'notification-done-activator')
    io.report.push.activation = await activationEvidence(io, pid, 'notification-done-activation')
  }
  try {
    await io.waitFor(async () => (await io.mock.logs()).some((log) => log.habitId === completed.data.habitId), 'the Done habit log', 60000)
  } catch (error) {
    if (!windows || !error.message.startsWith('Timed out')) throw error
    io.report.push.activationAfterTimeout = await activationEvidence(io, pid, 'notification-done-activation-timeout')
    throw new Error(`${error.message}; ${describeActivation(io.report.push.activationAfterTimeout)}`)
  }
  // A second request would follow the shell's first response well inside this window.
  await io.delay(5000)
  io.report.push.done = assertDoneDelivered({ logs: await io.mock.logs(), habitId: completed.data.habitId, visible: await windowsOf(io, pid) })
  const expired = await sendReminder(io, deliver, 'expired')
  await notification(io, pid, expired, false, 'notification-expired')
  await io.stop(shell)
  await io.mock.sessionMode('expired')
  io.proxy.reset({ expectAuthenticated: false, reportSignIn: true })
  // The refreshed access token lives 65 seconds and the BFF refreshes inside 60, so 6 seconds make it due.
  await io.delay(6000)
  // With no shell running, COM starts the shell from its activator registration, as it does for a click.
  if (windows) {
    try {
      await activateDone(io, expired, 'notification-expired-activator')
    } catch (error) {
      // A failed call can still leave a shell that COM started, and only an adopted shell is stopped by the phase cleanup.
      for (const started of await io.findProcesses()) io.adopt(started)
      throw error
    }
  } else await notification(io, 0, expired, true, 'notification-expired-signed-out')
  // Adopt the launched shell before any later wait, so a missing sign-in page still leaves it to the phase cleanup.
  const launched = await io.waitFor(async () => (await io.findProcesses())[0], 'the notification-launched shell', 30000)
  io.adopt(launched)
  const signIn = await io.waitFor(() => io.proxy.read('sign-in'), 'the sign-in page after an expired-session Done', 120000)
  const visible = await io.waitFor(() => windowsOf(io, launched), 'the sign-in window to show', 30000)
  await io.delay(5000)
  io.report.push.expired = assertExpiredDone({ logs: await io.mock.logs(), habitId: expired.data.habitId, visible, signIn })
}

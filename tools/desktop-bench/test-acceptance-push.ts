import assert from 'node:assert/strict'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { createHash, generateKeyPairSync, verify } from 'node:crypto'
import { createServer as createHttpServer } from 'node:http'
import { EventEmitter } from 'node:events'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFile, spawnSync } from 'node:child_process'
import { promisify } from 'node:util'
import { runInNewContext } from 'node:vm'
import { after, test } from 'node:test'
import { createAcceptanceHandler } from './acceptance-mock'
import { assertDoneDelivered, assertExpiredDone, visibleWindows } from './acceptance-contract.mjs'
import { apnsPayload, apnsProviderToken, apnsRequest, apsEnvironment, exercisePush, isWnsChannel, pushReadiness, repeatReminder,
  sendApns, sendWns, signedApsEnvironment, takePushCredentials, wnsAccessToken, wnsPayload } from './acceptance-push.mjs'

// Repeat reminder push acceptance (#1861). Shapes follow orbit-api ReminderSchedulerService.Repeat.cs RecordRepeat,
// PushNotificationService.CreateWebPushPayload, ApnsPushSender.CreatePayload and WnsPushSender.SendAsync.
const pushHabit = '6f1c2a5e-7b3d-4c8e-9a10-2b3c4d5e6f70'
const pushReminder = () => repeatReminder({ habitId: pushHabit, title: 'Water', doneToken: 'one-use-token',
  reminderAt: new Date('2026-11-08T15:04:05.123Z'), timeZone: 'UTC' })

test('repeat reminder copies the API metadata, label, tag and round-trip timestamps', () => {
  const reminder = pushReminder()
  assert.deepEqual(reminder, {
    title: 'Water', body: 'Next at 4:04 PM', url: '/',
    data: {
      habitId: pushHabit, tag: 'orbit-repeat-6f1c2a5e7b3d4c8e9a102b3c4d5e6f70', reminderAtUtc: '2026-11-08T15:04:05.1230000Z',
      doneExpiresAtUtc: '2026-11-08T16:04:05.1230000Z', doneToken: 'one-use-token', doneLabel: 'Done',
    },
  })
  assert.equal(repeatReminder({ habitId: pushHabit, title: 'Water', doneToken: 't', reminderAt: new Date('2026-11-08T23:30:00Z'), timeZone: 'UTC' }).body, 'Next at 12:30 AM')
  assert.equal(repeatReminder({ habitId: pushHabit, title: 'Water', doneToken: 't', reminderAt: new Date('2026-11-08T11:00:00Z'), timeZone: 'America/Sao_Paulo' }).body, 'Next at 9:00 AM')
})

test('Windows raw and APNs payloads keep the producer key order and nesting', () => {
  const reminder = pushReminder()
  assert.equal(wnsPayload(reminder), '{"title":"Water","body":"Next at 4:04 PM","habitId":"6f1c2a5e-7b3d-4c8e-9a10-2b3c4d5e6f70",' +
    '"tag":"orbit-repeat-6f1c2a5e7b3d4c8e9a102b3c4d5e6f70","reminderAtUtc":"2026-11-08T15:04:05.1230000Z",' +
    '"doneExpiresAtUtc":"2026-11-08T16:04:05.1230000Z","doneToken":"one-use-token","doneLabel":"Done","url":"/"}')
  const apple = apnsPayload(reminder)
  assert.deepEqual(Object.keys(apple), ['aps', 'body'])
  assert.deepEqual(Object.keys(apple.aps), ['alert', 'sound', 'category'])
  assert.deepEqual(apple.aps, { alert: { title: 'Water', body: 'Next at 4:04 PM' }, sound: 'default', category: 'orbit-repeat-reminder' })
  assert.deepEqual(Object.keys(apple.body), [...Object.keys(reminder.data), 'url'])
  assert.deepEqual(apple.body, { ...reminder.data, url: '/' })
})

test('only HTTPS notify.windows.com channels on the default port receive the WNS bearer token', () => {
  for (const uri of ['https://dm3p.notify.windows.com/?token=channel', 'https://NOTIFY.windows.com/x', 'https://wns2-bl2p.notify.windows.com:443/w/?token=a']) {
    assert.equal(isWnsChannel(uri), true, uri)
  }
  for (const uri of ['http://dm3p.notify.windows.com/?token=a', 'https://notify.windows.com.example/x', 'https://evilnotify.windows.com/x',
    'https://dm3p.notify.windows.com:8443/x', 'https://user:pass@dm3p.notify.windows.com/x', 'https://dm3p.notify.windows.com/x#frag', 'not a url', '']) {
    assert.equal(isWnsChannel(uri), false, uri)
  }
})

test('WNS client credentials request the WNS scope and never echo the secret on failure', async () => {
  const calls: { url: string; init: RequestInit }[] = []
  const token = await wnsAccessToken({ tenantId: 'tenant id', clientId: 'client', clientSecret: 'secret-value' }, async (url: string, init: RequestInit) => {
    calls.push({ url, init })
    return new Response(JSON.stringify({ token_type: 'Bearer', expires_in: 3599, access_token: 'wns-access' }), { status: 200 })
  })
  assert.equal(token, 'wns-access')
  assert.equal(calls[0].url, 'https://login.microsoftonline.com/tenant%20id/oauth2/v2.0/token')
  assert.equal(calls[0].init.method, 'POST')
  assert.deepEqual(Object.fromEntries(new URLSearchParams(String(calls[0].init.body))), {
    grant_type: 'client_credentials', client_id: 'client', client_secret: 'secret-value', scope: 'https://wns.windows.com/.default',
  })
  for (const reply of [new Response('{"error":"invalid_client"}', { status: 401 }), new Response('{"access_token":" "}', { status: 200 })]) {
    await assert.rejects(() => wnsAccessToken({ tenantId: 't', clientId: 'c', clientSecret: 'secret-value' }, async () => reply),
      (error: Error) => /WNS authentication/.test(error.message) && !error.message.includes('secret-value'))
  }
})

test('WNS delivery posts the raw payload with the producer headers and fails on any non-200 status', async () => {
  const calls: { url: string; init: RequestInit }[] = []
  const send = (status: number) => async (url: string, init: RequestInit) => { calls.push({ url, init }); return new Response(null, { status }) }
  const payload = wnsPayload(pushReminder())
  assert.deepEqual(await sendWns('https://dm3p.notify.windows.com/?token=channel', payload, 'wns-access', send(200)), { status: 200 })
  assert.equal(calls[0].init.method, 'POST')
  assert.deepEqual(calls[0].init.headers, { authorization: 'Bearer wns-access', 'x-wns-type': 'wns/raw', 'content-type': 'application/octet-stream' })
  assert.equal(Buffer.from(calls[0].init.body as Uint8Array).toString('utf8'), payload)
  await assert.rejects(() => sendWns('https://dm3p.notify.windows.com/?token=channel', payload, 'wns-access', send(410)), /HTTP 410/)
  await assert.rejects(() => sendWns('https://example.invalid/?token=channel', payload, 'wns-access', send(200)), /not a WNS endpoint/)
  assert.equal(calls.length, 2)
})

test('APNs provider token is an ES256 JWT that verifies against the key', () => {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
  const pem = privateKey.export({ format: 'pem', type: 'pkcs8' }).toString()
  const token = apnsProviderToken({ keyId: 'KEY123', teamId: 'TEAM123', privateKey: pem }, 1_800_000_000)
  const [header, claims, signature] = token.split('.')
  assert.deepEqual(JSON.parse(Buffer.from(header, 'base64url').toString()), { alg: 'ES256', kid: 'KEY123' })
  assert.deepEqual(JSON.parse(Buffer.from(claims, 'base64url').toString()), { iss: 'TEAM123', iat: 1_800_000_000 })
  assert.equal(verify('sha256', Buffer.from(`${header}.${claims}`), { key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(signature, 'base64url')), true)
})

test('APNs request selects the entitlement environment and the registered desktop topic', () => {
  for (const [environment, origin] of [['development', 'https://api.sandbox.push.apple.com'], ['production', 'https://api.push.apple.com']]) {
    const request = apnsRequest({ deviceToken: 'ab cd', topic: 'org.useorbit.desktop.staging', environment, reminder: pushReminder(), providerToken: 'provider' })
    assert.equal(request.origin, origin)
    assert.deepEqual(request.headers, {
      ':method': 'POST', ':path': '/3/device/ab%20cd', authorization: 'bearer provider', 'apns-topic': 'org.useorbit.desktop.staging',
      'apns-push-type': 'alert', 'apns-collapse-id': 'orbit-repeat-6f1c2a5e7b3d4c8e9a102b3c4d5e6f70', 'content-type': 'application/json',
    })
    assert.deepEqual(JSON.parse(request.body), apnsPayload(pushReminder()))
  }
  assert.throws(() => apnsRequest({ deviceToken: 'a', topic: 'org.useorbit.desktop.staging', environment: 'other', reminder: pushReminder(), providerToken: 'p' }), /environment/)
})

test('APNs delivery reports success only for HTTP 200 and keeps the rejection reason', async () => {
  const fakeConnect = (status: number, body: string) => (origin: string) => {
    const session = Object.assign(new EventEmitter(), {
      origin, closed: false,
      close() { this.closed = true },
      request(headers: Record<string, string>) {
        const stream = Object.assign(new EventEmitter(), {
          headers, written: '', setEncoding() {},
          end(value: string) {
            this.written = value
            queueMicrotask(() => { stream.emit('response', { ':status': status }); stream.emit('data', body); stream.emit('end') })
          },
        })
        sessions.push({ session, stream })
        return stream
      },
    })
    return session
  }
  const sessions: { session: { closed: boolean; origin: string }; stream: { headers: Record<string, string>; written: string } }[] = []
  const request = apnsRequest({ deviceToken: 'token', topic: 'org.useorbit.desktop.staging', environment: 'development', reminder: pushReminder(), providerToken: 'provider' })
  assert.deepEqual(await sendApns(request, fakeConnect(200, '')), { status: 200 })
  assert.equal(sessions[0].session.origin, 'https://api.sandbox.push.apple.com')
  assert.equal(sessions[0].stream.headers['apns-topic'], 'org.useorbit.desktop.staging')
  assert.equal(sessions[0].stream.written, request.body)
  assert.equal(sessions[0].session.closed, true)
  await assert.rejects(() => sendApns(request, fakeConnect(400, '{"reason":"BadDeviceToken"}')), /HTTP 400.*BadDeviceToken/)
  assert.equal(sessions[1].session.closed, true)
})

test('aps-environment comes only from parsed code signature entitlements and a parse miss fails loudly', () => {
  const signed = (stdout: string) => ({ status: 0, stdout, stderr: 'Executable=/Applications/Orbit Staging.app/Contents/MacOS/orbit\n' })
  const plist = '<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict></dict></plist>\n'
  assert.equal(apsEnvironment(signed(plist), { 'com.apple.developer.aps-environment': 'development', 'com.apple.security.app-sandbox': true }), 'development')
  assert.equal(apsEnvironment(signed(plist), { 'com.apple.developer.aps-environment': 'production' }), 'production')
  assert.equal(apsEnvironment(signed(plist), { 'com.apple.security.app-sandbox': true }), null)
  assert.equal(apsEnvironment(signed(''), undefined), null, 'a signature without entitlements prints nothing')
  assert.equal(apsEnvironment({ status: 1, stdout: '', stderr: 'Orbit Staging.app: code object is not signed at all\n' }, undefined), null)
  assert.throws(() => apsEnvironment(signed(plist), { 'com.apple.developer.aps-environment': 'staging' }), /unknown com\.apple\.developer\.aps-environment value: "staging"/)
  for (const entitlements of [undefined, null, [], 'development']) {
    assert.throws(() => apsEnvironment(signed('garbage'), entitlements),
      /not a parseable plist: stdout 7 bytes starting "garbage", stderr 64 bytes starting "Executable=/)
  }
})

if (process.platform === 'darwin') {
  // The real codesign and plutil produce every capture below, on bundles signed the ways the acceptance shell can be.
  const directory = mkdtempSync(join(tmpdir(), 'orbit-acceptance-codesign-'))
  after(() => rmSync(directory, { recursive: true, force: true }))
  const run = (command: string, args: string[]) => {
    const result = spawnSync(command, args, { encoding: 'utf8', timeout: 30000 })
    assert.equal(result.status, 0, result.stderr)
  }
  writeFileSync(join(directory, 'main.c'), 'int main(void) { return 0; }\n')
  run('clang', [join(directory, 'main.c'), '-o', join(directory, 'binary')])
  const entitlementFiles = { aps: { 'com.apple.developer.aps-environment': 'development', 'com.apple.security.app-sandbox': true },
    sandbox: { 'com.apple.security.app-sandbox': true } } as const
  const bundle = (name: string) => {
    const contents = join(directory, `${name}.app`, 'Contents')
    mkdirSync(join(contents, 'MacOS'), { recursive: true })
    cpSync(join(directory, 'binary'), join(contents, 'MacOS', 'orbit'))
    writeFileSync(join(contents, 'Info.plist'), '<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict><key>CFBundleExecutable</key><string>orbit</string>' +
      `<key>CFBundleIdentifier</key><string>org.useorbit.acceptance.${name}</string></dict></plist>`)
    run('codesign', ['--remove-signature', join(contents, 'MacOS', 'orbit')])
    if (name === 'adhoc') run('codesign', ['-s', '-', join(directory, `${name}.app`)])
    if (name in entitlementFiles) {
      const values = Object.entries(entitlementFiles[name as keyof typeof entitlementFiles])
        .map(([key, value]) => `<key>${key}</key>${value === true ? '<true/>' : `<string>${value}</string>`}`).join('')
      writeFileSync(join(directory, `${name}.entitlements`), `<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict>${values}</dict></plist>`)
      run('codesign', ['-s', '-', '--entitlements', join(directory, `${name}.entitlements`), join(directory, `${name}.app`)])
    }
    return join(directory, `${name}.app`)
  }
  for (const [name, status, environment] of [['aps', 0, 'development'], ['sandbox', 0, null], ['adhoc', 0, null], ['unsigned', 1, null]] as const) {
    test(`the real codesign capture of the ${name} bundle gives ${environment ?? 'no'} aps-environment and keeps its raw output`, async () => {
      const output = mkdtempSync(join(directory, `${name}-output-`))
      const { signature, environment: found } = await signedApsEnvironment(bundle(name), output)
      assert.equal(signature.status, status)
      assert.equal(found, environment)
      assert.equal(readFileSync(join(output, 'codesign-entitlements.stdout.log'), 'utf8'), signature.stdout)
      assert.equal(readFileSync(join(output, 'codesign-entitlements.stderr.log'), 'utf8'), signature.stderr)
      if (name === 'unsigned') assert.match(signature.stderr, /code object is not signed at all/)
      if (name === 'adhoc') assert.equal(signature.stdout, '')
      if (name === 'aps' || name === 'sandbox') assert.match(signature.stdout, /^<\?xml[\s\S]*<plist/)
    })
  }

  test('a codesign output that plutil cannot parse fails with the raw output lengths and first bytes', async () => {
    const output = mkdtempSync(join(directory, 'garbage-output-'))
    const execute = promisify(execFile)
    const run = async (command: string, args: string[]) => command === 'codesign' ? { stdout: 'garbage', stderr: 'Executable=/fixture/orbit\n' } : execute(command, args)
    await assert.rejects(() => signedApsEnvironment('/fixture/Orbit Staging.app', output, run),
      /not a parseable plist: stdout 7 bytes starting "garbage", stderr 26 bytes starting "Executable=\/fixture\/orbit\\n"/)
    assert.equal(readFileSync(join(output, 'codesign-entitlements.stdout.log'), 'utf8'), 'garbage')
  })
}

test('a codesign that cannot start is a failure, never an unsigned skip', async () => {
  const output = mkdtempSync(join(tmpdir(), 'orbit-acceptance-codesign-missing-'))
  try {
    const missing = Object.assign(new Error('spawn codesign ENOENT'), { code: 'ENOENT' })
    await assert.rejects(() => signedApsEnvironment('/fixture/Orbit Staging.app', output, async () => { throw missing }), error => error === missing)
  } finally {
    rmSync(output, { recursive: true, force: true })
  }
})

test('push readiness registers on Windows, skips with a named reason, and never skips silently', () => {
  const wns = { ORBIT_WNS_TENANT_ID: 't', ORBIT_WNS_CLIENT_ID: 'c', ORBIT_WNS_CLIENT_SECRET: 's' }
  const apns = { ORBIT_APNS_KEY_ID: 'k', ORBIT_APPLE_TEAM_ID: 't', ORBIT_APNS_PRIVATE_KEY: 'p' }
  assert.deepEqual(pushReadiness({ platform: 'win32', credentials: wns, environment: null }), { transport: 'wns', registration: true, delivery: true })
  const windowsSkip = pushReadiness({ platform: 'win32', credentials: { ORBIT_WNS_TENANT_ID: 't' }, environment: null })
  assert.equal(windowsSkip.registration, true)
  assert.equal(windowsSkip.delivery, false)
  assert.match(windowsSkip.skipped!, /ORBIT_WNS_CLIENT_ID, ORBIT_WNS_CLIENT_SECRET/)
  const unsigned = pushReadiness({ platform: 'darwin', credentials: apns, environment: null, signed: false })
  assert.equal(unsigned.registration, false)
  assert.match(unsigned.skipped!, /com\.apple\.developer\.aps-environment/)
  assert.match(unsigned.skipped!, /the acceptance build is unsigned: the job has no Developer ID signing material, because only a same-repository macOS job receives the desktop-staging environment\.$/)
  assert.doesNotMatch(unsigned.skipped!, /2364/)
  assert.throws(() => pushReadiness({ platform: 'darwin', credentials: apns, environment: null, signed: true }),
    /^Error: The Developer ID signed shell has no com\.apple\.developer\.aps-environment entitlement; see codesign-entitlements\.stdout\.log$/)
  assert.deepEqual(pushReadiness({ platform: 'darwin', credentials: apns, environment: 'production' }), { transport: 'apns', registration: true, delivery: true })
  assert.match(pushReadiness({ platform: 'darwin', credentials: {}, environment: 'development' }).skipped!, /ORBIT_APNS_KEY_ID, ORBIT_APPLE_TEAM_ID, ORBIT_APNS_PRIVATE_KEY/)
})

test('push credentials leave the environment before any build or child process inherits it', () => {
  const environment: NodeJS.ProcessEnv = { PATH: '/bin', ORBIT_WNS_CLIENT_SECRET: 'secret', ORBIT_APNS_PRIVATE_KEY: 'key', ORBIT_WNS_TENANT_ID: '' }
  assert.deepEqual(takePushCredentials(environment), { ORBIT_WNS_CLIENT_SECRET: 'secret', ORBIT_APNS_PRIVATE_KEY: 'key' })
  assert.deepEqual(environment, { PATH: '/bin' })
})

const pushJwt = (claims: Record<string, unknown>) => `${Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url')}.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.hermetic-test-signature`
const sessionToken = pushJwt({ exp: 4102444800, hermeticFixtureSession: 'desktop-bench', 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier': 'hermetic-perf-user' })

async function withAcceptanceMock(now: () => number, run: (call: (method: string, path: string, body?: unknown, token?: string) => Promise<{ status: number; body: unknown }>) => Promise<void>) {
  const server = createHttpServer(createAcceptanceHandler(sessionToken, now))
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as { port: number }
  try {
    await run(async (method, path, body, token) => {
      const response = await fetch(`http://127.0.0.1:${port}${path}`, { method, headers: {
        ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...(token ? { authorization: `Bearer ${token}` } : {}),
      }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
      const text = await response.text()
      return { status: response.status, body: text ? JSON.parse(text) : null }
    })
  } finally {
    server.closeAllConnections()
    await new Promise(resolve => server.close(resolve))
  }
}

test('mock API records the native registration and lists it with the API endpoint hash', async () => {
  await withAcceptanceMock(() => Date.parse('2026-11-08T12:00:00Z'), async (call) => {
    const registration = { endpoint: 'https://dm3p.notify.windows.com/?token=channel', p256dh: 'wns', auth: 'wns', deviceId: '0f8fad5b-d9cb-469f-a165-70867728950e' }
    assert.equal((await call('POST', '/api/notifications/subscribe', registration)).status, 401)
    assert.deepEqual(await call('POST', '/api/notifications/subscribe', registration, sessionToken), { status: 200, body: null })
    assert.equal((await call('POST', '/api/notifications/subscribe', { endpoint: '' }, sessionToken)).status, 400)
    const listed = await call('GET', '/api/notifications/subscriptions', undefined, sessionToken)
    assert.equal(listed.status, 200)
    const items = (listed.body as { items: { transport: string; endpointHash: string; createdAtUtc: string }[]; max: number })
    assert.equal(items.max, 5)
    assert.equal(items.items.length, 1)
    assert.equal(items.items[0].transport, 'native')
    assert.equal(items.items[0].endpointHash, createHash('sha256').update(registration.endpoint).digest('hex'))
    assert.equal(items.items[0].createdAtUtc, '2026-11-08T12:00:00.000Z')
    const recorded = await call('GET', '/_test/push-registrations')
    assert.deepEqual((recorded.body as Record<string, unknown>[]).map(({ endpoint, p256dh, apnsTopic, deviceId }) => ({ endpoint, p256dh, apnsTopic, deviceId })),
      [{ endpoint: registration.endpoint, p256dh: 'wns', apnsTopic: null, deviceId: registration.deviceId }])
    assert.equal((await call('POST', '/api/notifications/unsubscribe', { endpoint: registration.endpoint, p256dh: 'wns', auth: 'wns' }, sessionToken)).status, 200)
    assert.deepEqual((await call('GET', '/api/notifications/subscriptions', undefined, sessionToken)).body, { items: [], max: 5 })
  })
})

test('mock API completes a one-use reminder token once and records every habit log', async () => {
  await withAcceptanceMock(() => Date.parse('2026-11-08T12:00:00Z'), async (call) => {
    const minted = await call('POST', '/_test/repeat-reminders', { habitId: pushHabit })
    const { doneToken } = minted.body as { doneToken: string }
    assert.match(doneToken, /^[A-Za-z0-9_-]{43}$/)
    const done = await call('POST', '/api/reminders/done', { token: doneToken })
    assert.equal(done.status, 200)
    assert.equal((done.body as { isFirstCompletionToday: boolean }).isFirstCompletionToday, true)
    for (const token of [doneToken, 'unknown']) {
      assert.deepEqual(await call('POST', '/api/reminders/done', { token }), { status: 400,
        body: { error: 'This reminder action is no longer available.', errorCode: 'INVALID_REMINDER_ACTION' } })
    }
    assert.equal((await call('POST', '/api/reminders/done', {})).status, 400)
    assert.equal((await call('POST', `/api/habits/${pushHabit}/log`, {}, sessionToken)).status, 200)
    assert.deepEqual(await call('GET', '/_test/habit-logs'), { status: 200, body: [
      { habitId: pushHabit, source: 'reminder-done', atUtc: '2026-11-08T12:00:00.000Z' },
      { habitId: pushHabit, source: 'habit-log', atUtc: '2026-11-08T12:00:00.000Z' },
    ] })
  })
})

test('mock session expiry forces a short refreshed token, then rejects the session but keeps anonymous Done', async () => {
  let now = Date.parse('2026-11-08T12:00:00Z')
  await withAcceptanceMock(() => now, async (call) => {
    assert.equal((await call('GET', '/api/notifications/subscriptions', undefined, sessionToken)).status, 200)
    assert.equal((await call('PUT', '/_test/session-mode', { mode: 'later' })).status, 400)
    assert.equal((await call('PUT', '/_test/session-mode', { mode: 'expiring' })).status, 204)
    assert.equal((await call('GET', '/api/notifications/subscriptions', undefined, sessionToken)).status, 401)
    const refreshed = await call('POST', '/api/auth/refresh', { refreshToken: 'hermetic-refresh' })
    assert.equal(refreshed.status, 200)
    const { token, refreshToken } = refreshed.body as { token: string; refreshToken: string }
    assert.equal(refreshToken, 'hermetic-refresh')
    const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()) as Record<string, unknown>
    assert.equal(claims.exp, now / 1000 + 65)
    assert.equal(claims.hermeticFixtureSession, 'desktop-bench')
    assert.equal((await call('GET', '/api/notifications/subscriptions', undefined, token)).status, 200)
    const { doneToken } = (await call('POST', '/_test/repeat-reminders', { habitId: pushHabit })).body as { doneToken: string }
    now += 1000
    assert.equal((await call('PUT', '/_test/session-mode', { mode: 'expired' })).status, 204)
    assert.equal((await call('GET', '/api/notifications/subscriptions', undefined, token)).status, 401)
    assert.equal((await call('POST', '/api/auth/refresh', { refreshToken })).status, 401)
    assert.equal((await call('POST', '/api/reminders/done', { token: doneToken })).status, 200)
  })
})

test('Done and expired-session outcomes require the exact log count, window state and sign-in page', () => {
  const logs = [{ habitId: pushHabit, source: 'reminder-done' }, { habitId: 'other', source: 'reminder-done' }]
  assert.deepEqual(assertDoneDelivered({ logs, habitId: pushHabit, visible: 0 }), { logs: 1, windowVisible: false })
  assert.throws(() => assertDoneDelivered({ logs: [], habitId: pushHabit, visible: 0 }), /exactly one.*0/)
  assert.throws(() => assertDoneDelivered({ logs: [logs[0], logs[0]], habitId: pushHabit, visible: 0 }), /exactly one.*2/)
  assert.throws(() => assertDoneDelivered({ logs, habitId: pushHabit, visible: 1 }), /window/)
  const signIn = { kind: 'sign-in', route: '/login' }
  assert.deepEqual(assertExpiredDone({ logs: [logs[1]], habitId: pushHabit, visible: 1, signIn }), { logs: 0, windowVisible: true, route: '/login' })
  assert.throws(() => assertExpiredDone({ logs, habitId: pushHabit, visible: 1, signIn }), /no habit log/)
  assert.throws(() => assertExpiredDone({ logs: [], habitId: pushHabit, visible: 0, signIn }), /visible/)
  assert.throws(() => assertExpiredDone({ logs: [], habitId: pushHabit, visible: 1, signIn: { kind: 'sign-in', route: '/' } }), /sign-in page/)
  assert.equal(visibleWindows('win32', { windows: [
    { className: 'Tauri Window', visible: true }, { className: 'Tauri Window', visible: false }, { className: '#32770', visible: true },
  ] }), 1)
  assert.equal(visibleWindows('darwin', { windows: [{ layer: 0, onscreen: true }, { layer: 0, onscreen: false }, { layer: 25, onscreen: true }] }), 1)
  assert.throws(() => visibleWindows('win32', { sent: 'windows' }), /window list/)
})

const pushProbeSource = (reportSignIn: boolean) => readFileSync(new URL('./acceptance-probe.js', import.meta.url), 'utf8')
  .replaceAll('__BENCH_EXPECT_AUTHENTICATED__', String(!reportSignIn))
  .replaceAll('__BENCH_REPORT_SIGN_IN__', String(reportSignIn))
  .replace('run().catch', 'globalThis.completion = run().catch')

function pushProbeContext(pathname: string, options: { checked?: boolean; storage?: Map<string, string>; status?: number; command?: string } = {}) {
  const storage = options.storage ?? new Map<string, string>()
  const navigations: string[] = []
  const reports: { kind: string; route?: string; message?: string }[] = []
  const requests: string[] = []
  const browserWindow: { top?: unknown } = {}
  browserWindow.top = browserWindow
  const toggle = { disabled: false, clicks: 0, attributes: { 'aria-label': 'This device', 'aria-checked': String(options.checked === true) } as Record<string, string>,
    getAttribute(name: string) { return this.attributes[name] ?? null },
    click() { this.clicks++; this.attributes['aria-checked'] = 'true' } }
  let commandServed = false
  const context = {
    URLSearchParams, JSON, window: browserWindow, setTimeout: (callback: () => void) => { queueMicrotask(callback) },
    sessionStorage: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => { storage.set(key, value) }, removeItem: (key: string) => { storage.delete(key) } },
    location: { pathname, search: '', assign(url: string) { navigations.push(url) }, reload() {} },
    document: { readyState: 'complete', cookie: '', querySelector(selector: string) {
      if (selector === '[data-testid="push-status"]') return null
      if (selector.startsWith('[data-habit-id')) return {}
      if (selector.startsWith('[data-astra-button]')) return {}
      return null
    }, querySelectorAll(selector: string) { return selector === '[role="switch"]' ? [toggle] : [] } },
    fetch: async (url: string, init?: { body: string }) => {
      requests.push(url)
      if (url === '/_bench/events') { reports.push(JSON.parse(init!.body)); return new Response(null, { status: 204 }) }
      if (url === '/_bench/command') {
        if (!commandServed && options.command) { commandServed = true; return new Response(options.command, { status: 200 }) }
        return new Promise<Response>(() => {})
      }
      if (url === '/api/auth/session') return new Response(null, { status: options.status ?? 200 })
      return new Response('{}', { status: 200 })
    },
  }
  return { context, storage, navigations, reports, requests, toggle }
}

test('probe push command keeps the switch labels across navigation to Perfil notifications', async () => {
  const probe = pushProbeContext('/', { command: 'push-enable:["This device","Neste aparelho"]' })
  runInNewContext(pushProbeSource(false), probe.context)
  for (let index = 0; index < 50 && !probe.navigations.length; index++) await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual(probe.navigations, ['/profile/notifications'])
  assert.equal(probe.storage.get('orbit-acceptance-push'), '["This device","Neste aparelho"]')
  assert.deepEqual(probe.reports.map(event => event.kind), ['hoje'])
})

for (const checked of [false, true]) {
  test(`probe turns on the real Perfil switch ${checked ? 'without toggling an enabled' : 'from an off'} registration and returns to Hoje`, async () => {
    const storage = new Map([['orbit-acceptance-push', '["This device","Neste aparelho"]']])
    const probe = pushProbeContext('/profile/notifications', { checked, storage })
    runInNewContext(pushProbeSource(false), probe.context)
    await (probe.context as typeof probe.context & { completion: Promise<void> }).completion
    assert.equal(probe.toggle.clicks, checked ? 0 : 1)
    assert.deepEqual(probe.reports.map(event => event.kind), ['push-enabled'])
    assert.deepEqual(probe.navigations, ['/'])
    assert.equal(storage.has('orbit-acceptance-push'), false)
  })
}

test('expired-session probe reports the sign-in page without signing in again', async () => {
  const probe = pushProbeContext('/login', { status: 401 })
  runInNewContext(pushProbeSource(true), probe.context)
  await (probe.context as typeof probe.context & { completion: Promise<void> }).completion
  assert.deepEqual(probe.reports, [{ kind: 'sign-in', route: '/login', session: 401 }])
  assert.deepEqual(probe.navigations, [])
  assert.ok(!probe.requests.some(url => /send-code|verify-code/.test(url)))
})

test('proxy serves the sign-in report mode only to the launch that asks for it', async () => {
  const source = readFileSync(new URL('./server.mjs', import.meta.url), 'utf8')
    .replace(/^import .*$/gm, '').replace('export async function startProxy', 'async function startProxy')
  let handle: (incoming: unknown, response: unknown) => Promise<void> = async () => { assert.fail('Proxy handler not registered') }
  const context = { Buffer, benchmarkViewport: [900, 600], readFile: async () => 'expect=__BENCH_EXPECT_AUTHENTICATED__ report=__BENCH_REPORT_SIGN_IN__',
    createServer: (callback: typeof handle) => { handle = callback; return { once() {}, listen(_port: number, _host: string, ready: () => void) { ready() } } },
  }
  runInNewContext(`${source}\nglobalThis.startProxy = startProxy`, context)
  const startProxy = (context as typeof context & { startProxy: (options: unknown) => Promise<{ reset: (settings: unknown) => void }> }).startProxy
  const proxy = await startProxy({ probePath: 'probe', port: 3400, upstreamPort: 3401, acceptance: true, route: () => false })
  const served: string[] = []
  for (const settings of [{ expectAuthenticated: true }, { expectAuthenticated: false, reportSignIn: true }]) {
    proxy.reset(settings)
    await handle({ url: '/_bench/probe.js' }, { writeHead() { return this }, end(value: string) { served.push(value) } })
  }
  assert.deepEqual(served, ['expect=true report=false', 'expect=false report=true'])
})

function pushHarness(platform: 'win32' | 'darwin', overrides: { logsAfterDone?: number; visibleAfterDone?: number; expiredLogs?: number; signIn?: boolean; credentials?: Record<string, string>; environment?: string | null; signed?: boolean } = {}) {
  const events: string[] = []
  const records = new Map<string, unknown>()
  const logs: { habitId: string; source: string }[] = []
  const reminders = new Map<string, string>()
  const proxyEvents: Record<string, unknown> = {}
  let hidden = false
  let launchedVisible = 0
  let shellAlive = true
  let notified: { title: string; doneToken: string }[] = []
  const report: { push?: Record<string, unknown> } = {}
  const wnsCredentials = { ORBIT_WNS_TENANT_ID: 't', ORBIT_WNS_CLIENT_ID: 'c', ORBIT_WNS_CLIENT_SECRET: 's' }
  const apnsCredentials = { ORBIT_APNS_KEY_ID: 'k', ORBIT_APPLE_TEAM_ID: 't', ORBIT_APNS_PRIVATE_KEY: 'p' }
  const transport = platform === 'win32' ? 'wns' : 'apns'
  const io = {
    platform, report, labels: ['This device', 'Neste aparelho'], doneLabel: 'Done', allowLabel: 'Allow', appName: 'Orbit Staging', timeZone: 'UTC',
    credentials: overrides.credentials ?? (platform === 'win32' ? wnsCredentials : apnsCredentials), signed: overrides.signed ?? false,
    apsEnvironment: async () => overrides.environment === undefined ? 'development' : overrides.environment,
    now: () => Date.parse('2026-11-08T12:00:00Z'),
    delay: async (milliseconds: number) => { events.push(`delay ${milliseconds}`) },
    waitFor: async (read: () => Promise<unknown> | unknown, label: string) => {
      for (let attempt = 0; attempt < 20; attempt++) {
        const value = await read()
        if (value) return value
      }
      throw new Error(`Timed out waiting for ${label}`)
    },
    record: async (name: string, value: unknown) => { events.push(`record ${name}`); records.set(name, value) },
    warn: (message: string) => { events.push(`warn ${message}`) },
    mock: {
      registrations: async () => events.includes('push-enabled') ? [{ endpoint: platform === 'win32' ? 'https://dm3p.notify.windows.com/?token=c' : 'abcd', p256dh: transport, auth: transport,
        apnsTopic: platform === 'win32' ? null : 'org.useorbit.desktop.staging', deviceId: '0f8fad5b-d9cb-469f-a165-70867728950e', receivedAtUtc: 'now' }] : [],
      mintReminder: async (habitId: string) => { const token = `token-${reminders.size}`; reminders.set(token, habitId); return token },
      logs: async () => logs.slice(),
      sessionMode: async (mode: string) => { events.push(`session ${mode}`) },
    },
    proxy: {
      send(command: string) {
        events.push(`send ${command}`)
        if (command.startsWith('push-enable:')) { events.push('push-enabled'); proxyEvents['push-enabled'] = { kind: 'push-enabled' } }
      },
      read: (kind: string) => proxyEvents[kind],
      reset(settings: Record<string, unknown>) { events.push(`reset ${JSON.stringify(settings)}`) },
    },
    launch: async () => { events.push('launch'); return { child: { pid: 41 } } },
    stop: async () => { events.push('stop'); shellAlive = false },
    adopt: (pid: number) => { events.push(`adopt ${pid}`) },
    findProcesses: async () => launchedVisible ? [77] : [],
    sender: async (kind: string) => {
      events.push(`sender ${kind}`)
      return async (reminder: { title: string; data: { doneToken: string } }) => {
        events.push(`deliver ${reminder.title}`)
        notified.push({ title: reminder.title, doneToken: reminder.data.doneToken })
        return { status: 200 }
      }
    },
    native: async (pid: number, command: string, options: { title?: string; label?: string; invoke?: boolean; openCenter?: boolean } = {}) => {
      events.push(`native ${pid} ${command}${options.invoke ? ' invoke' : ''}${options.label ? ` ${options.label}` : ''}`)
      if (command === 'close') { hidden = true; return { sent: 'close' } }
      if (command === 'windows') {
        const visible = pid === 77 ? launchedVisible : hidden ? (proxyEvents.done ? overrides.visibleAfterDone ?? 0 : 0) : 1
        return platform === 'win32' ? { windows: Array.from({ length: visible }, () => ({ className: 'Tauri Window', visible: true })) }
          : { windows: Array.from({ length: visible }, () => ({ layer: 0, onscreen: true })) }
      }
      if (command === 'notification') {
        if (options.label === 'Allow') return { found: false, tree: [{ role: 'AXApplication', parent: -1, text: 'Notification Center' }] }
        const toast = notified.find((entry) => entry.title === options.title)
        if (!toast) return { found: false, windows: [] }
        if (!options.invoke) return { found: true, invoked: false, title: toast.title }
        const habitId = reminders.get(toast.doneToken)!
        if (shellAlive) {
          proxyEvents.done = true
          for (let index = 0; index < (overrides.logsAfterDone ?? 1); index++) logs.push({ habitId, source: 'reminder-done' })
        } else {
          for (let index = 0; index < (overrides.expiredLogs ?? 0); index++) logs.push({ habitId, source: 'reminder-done' })
          launchedVisible = 1
          if (overrides.signIn !== false) proxyEvents['sign-in'] = { kind: 'sign-in', route: '/login', session: 401 }
        }
        return { found: true, invoked: true, title: toast.title }
      }
      throw new Error(`Unexpected native command ${command}`)
    },
  }
  return { io, events, report, logs, records }
}

test('push acceptance proves Done once with the window hidden, then an expired-session Done shows sign-in with no log', async () => {
  for (const platform of ['win32', 'darwin'] as const) {
    const harness = pushHarness(platform)
    await exercisePush(harness.io)
    const push = harness.report.push as { transport: string; registration: Record<string, unknown>; done: unknown; expired: unknown; skipped?: string }
    assert.equal(push.transport, platform === 'win32' ? 'wns' : 'apns')
    assert.equal(push.skipped, undefined)
    assert.deepEqual(push.done, { logs: 1, windowVisible: false })
    assert.deepEqual(push.expired, { logs: 0, windowVisible: true, route: '/login' })
    assert.equal(JSON.stringify(push.registration).includes('token=c'), false, 'the report never stores the channel token')
    const order = (event: string) => { const index = harness.events.findIndex((entry) => entry.startsWith(event)); assert.ok(index >= 0, event); return index }
    assert.ok(order('session expiring') < order('launch'))
    assert.ok(order('send push-enable:') < order('native 41 close'))
    assert.ok(order('native 41 close') < order('deliver Orbit acceptance done'))
    assert.ok(order('deliver Orbit acceptance done') < order('native 41 notification invoke Done'))
    assert.ok(order('deliver Orbit acceptance expired') < order('stop'))
    assert.ok(order('stop') < order('session expired'))
    assert.ok(order('session expired') < order('reset {"expectAuthenticated":false,"reportSignIn":true}'))
    assert.ok(order('reset {"expectAuthenticated":false,"reportSignIn":true}') < order('native 0 notification invoke Done'))
    assert.ok(order('native 0 notification invoke Done') < order('adopt 77'))
    const records = [...harness.records.keys()]
    assert.deepEqual(records, [...(platform === 'darwin' ? ['notification-authorization'] : []), 'notification-done', 'notification-expired', 'notification-expired-signed-out'])
    for (const [name, title] of [['notification-done', 'done'], ['notification-expired', 'expired'], ['notification-expired-signed-out', 'expired']]) {
      assert.match((harness.records.get(name) as { title: string }).title, new RegExp(`^Orbit acceptance ${title} `), name)
    }
    if (platform === 'darwin') assert.deepEqual(harness.records.get('notification-authorization'), { found: false, tree: [{ role: 'AXApplication', parent: -1, text: 'Notification Center' }] })
  }
})

test('push acceptance adopts the notification-launched shell before it waits for the sign-in page', async () => {
  const harness = pushHarness('win32', { signIn: false })
  await assert.rejects(() => exercisePush(harness.io), /Timed out waiting for the sign-in page after an expired-session Done/)
  assert.ok(harness.events.includes('adopt 77'), 'the phase cleanup stops the launched shell only when exercisePush adopted it')
})

test('push acceptance records every notification capture, also the ones that never match', async () => {
  const harness = pushHarness('win32')
  harness.io.sender = async () => async () => ({ status: 200 })
  await assert.rejects(() => exercisePush(harness.io), /Timed out waiting for the Orbit acceptance done .* system notification/)
  assert.deepEqual(harness.records.get('notification-done'), { found: false, windows: [] })
  assert.equal(harness.events.filter((event) => event === 'record notification-done').length, 40)
})

for (const [label, overrides, message] of [
  ['a duplicated Done log', { logsAfterDone: 2 }, /exactly one.*2/],
  ['a Done that opens the window', { visibleAfterDone: 1 }, /window/],
  ['an expired-session Done that still logs', { expiredLogs: 1 }, /no habit log/],
] as const) {
  test(`push acceptance fails on ${label}`, async () => {
    await assert.rejects(() => exercisePush(pushHarness('win32', overrides).io), message)
  })
}

test('push acceptance reports explicit skips for an unsigned macOS shell and for missing WNS credentials', async () => {
  const unsigned = pushHarness('darwin', { environment: null })
  await exercisePush(unsigned.io)
  assert.match((unsigned.report.push as { skipped: string }).skipped, /aps-environment/)
  assert.ok(!unsigned.events.includes('launch'))
  assert.ok(unsigned.events.some((event) => event.startsWith('warn ') && event.includes('aps-environment')))
  const signedWithoutEntitlement = pushHarness('darwin', { environment: null, signed: true })
  await assert.rejects(() => exercisePush(signedWithoutEntitlement.io), /Developer ID signed shell has no com\.apple\.developer\.aps-environment entitlement/)
  assert.ok(!signedWithoutEntitlement.events.includes('launch'))
  assert.ok(!signedWithoutEntitlement.events.some((event) => event.startsWith('warn ')))
  const windows = pushHarness('win32', { credentials: {} })
  await exercisePush(windows.io)
  const push = windows.report.push as { skipped: string; registration: { p256dh: string } }
  assert.match(push.skipped, /ORBIT_WNS_TENANT_ID/)
  assert.equal(push.registration.p256dh, 'wns')
  assert.ok(windows.events.includes('stop'))
  assert.ok(!windows.events.some((event) => event.startsWith('sender')))
})

const notificationFixture = `#import <AppKit/AppKit.h>
#import <ApplicationServices/ApplicationServices.h>
static NSString *scenario;
static NSMutableArray *performed;
@interface FixtureRunning : NSObject
@end
@implementation FixtureRunning
- (pid_t)processIdentifier { return 7; }
+ (NSArray *)runningApplicationsWithBundleIdentifier:(NSString *)identifier {
    return [identifier isEqual:@"com.apple.notificationcenterui"] ? @[[self new]] : @[];
}
+ (instancetype)runningApplicationWithProcessIdentifier:(pid_t)pid { return [self new]; }
- (BOOL)activateWithOptions:(NSUInteger)options { return YES; }
- (BOOL)terminate { return YES; }
@end
static NSDictionary *text(NSString *value) { return @{@"AXRole": @"AXStaticText", @"AXValue": value}; }
static NSDictionary *done(NSString *identifier) { return @{@"id": identifier, @"AXRole": @"AXButton", @"AXTitle": @"Done", @"actions": @[@"AXPress"]}; }
static AXUIElementRef fixtureApplication(pid_t pid) {
    NSString *custom = @"Name:Done\\nTarget:0x0\\nSelector:(null)";
    NSDictionary *other = @{@"id": @"other", @"AXRole": @"AXGroup", @"AXDescription": @"Orbit Staging, Orbit acceptance expired 0a1b2c3d",
        @"actions": @[@"AXPress", custom]};
    NSArray *groups = @[];
    if ([scenario isEqual:@"custom"]) groups = @[other, @{@"id": @"first", @"AXRole": @"AXGroup",
        @"AXDescription": @"Orbit Staging, Orbit acceptance done 6f1c2a5e, Next at 4:04 PM", @"actions": @[@"AXPress", custom]}];
    if ([scenario isEqual:@"button"]) groups = @[@{@"id": @"first", @"AXRole": @"AXGroup", @"actions": @[@"AXPress"],
        @"AXChildren": @[text(@"Orbit acceptance done 6f1c2a5e"), text(@"Next at 4:04 PM"), done(@"button-first")]}];
    if ([scenario isEqual:@"description"]) groups = @[@{@"id": @"first", @"AXRole": @"AXGroup", @"AXTitle": @"Orbit acceptance done 6f1c2a5e",
        @"actions": @[@"AXPress", @"AXCustomAction1"], @"descriptions": @{@"AXCustomAction1": @"Done", @"AXPress": @"press"}}];
    if ([scenario isEqual:@"missing"]) groups = @[other];
    if ([scenario isEqual:@"ambiguous"]) groups = @[@{@"id": @"first", @"AXRole": @"AXGroup",
        @"AXChildren": @[text(@"Orbit acceptance done 6f1c2a5e"), done(@"one"), done(@"two")]}];
    return (AXUIElementRef)CFBridgingRetain(@{@"AXRole": @"AXApplication", @"AXTitle": @"Notification Center", @"AXChildren": @[
        @{@"AXRole": @"AXMenuBar", @"AXChildren": @[@{@"AXRole": @"AXMenuBarItem", @"AXTitle": @"Orbit acceptance done 6f1c2a5e", @"actions": @[@"AXPress"]}]},
        @{@"AXRole": @"AXWindow", @"AXChildren": groups}]});
}
static AXError fixtureAttribute(AXUIElementRef element, CFStringRef key, CFTypeRef *value) {
    id result = ((__bridge NSDictionary *)element)[(__bridge NSString *)key];
    if (!result) return kAXErrorAttributeUnsupported;
    *value = CFBridgingRetain(result);
    return kAXErrorSuccess;
}
static AXError fixtureActions(AXUIElementRef element, CFArrayRef *names) {
    *names = (CFArrayRef)CFBridgingRetain(((__bridge NSDictionary *)element)[@"actions"] ?: @[]);
    return kAXErrorSuccess;
}
static AXError fixtureDescription(AXUIElementRef element, CFStringRef action, CFStringRef *description) {
    NSString *value = ((__bridge NSDictionary *)element)[@"descriptions"][(__bridge NSString *)action];
    if (!value) return kAXErrorActionUnsupported;
    *description = (CFStringRef)CFBridgingRetain(value);
    return kAXErrorSuccess;
}
static AXError fixturePerform(AXUIElementRef element, CFStringRef action) {
    [performed addObject:@{@"id": ((__bridge NSDictionary *)element)[@"id"] ?: @"", @"action": (__bridge NSString *)action}];
    return kAXErrorSuccess;
}
static Boolean fixtureTrusted(void) { return true; }
#define NSRunningApplication FixtureRunning
#define AXUIElementCreateApplication fixtureApplication
#define AXUIElementCopyAttributeValue fixtureAttribute
#define AXUIElementCopyActionNames fixtureActions
#define AXUIElementCopyActionDescription fixtureDescription
#define AXUIElementPerformAction fixturePerform
#define AXIsProcessTrusted fixtureTrusted
#define main acceptanceMain
#include NATIVE_SOURCE
#undef main
int main(int argc, const char *argv[]) {
    @autoreleasepool {
        scenario = @(argv[1]);
        performed = [NSMutableArray array];
        const char *arguments[] = {"acceptance", "1", "notification", "Orbit acceptance done 6f1c2a5e", "Done", argv[2], "0"};
        int status = acceptanceMain(7, arguments);
        NSData *encoded = [NSJSONSerialization dataWithJSONObject:performed options:0 error:NULL];
        fprintf(stderr, "%.*s", (int)encoded.length, (const char *)encoded.bytes);
        return status;
    }
}
`

if (process.platform === 'darwin') {
  const directory = mkdtempSync(join(tmpdir(), 'orbit-acceptance-notification-'))
  after(() => rmSync(directory, { recursive: true, force: true }))
  const source = join(directory, 'notification.m')
  const executable = join(directory, 'notification')
  writeFileSync(source, notificationFixture.replace('NATIVE_SOURCE', JSON.stringify(fileURLToPath(new URL('./acceptance-ax.m', import.meta.url)))))
  const compilation = spawnSync('clang', ['-fobjc-arc', '-framework', 'AppKit', '-framework', 'ApplicationServices', source, '-o', executable], { encoding: 'utf8', timeout: 30000 })
  assert.equal(compilation.status, 0, compilation.stderr)
  const custom = 'Name:Done\nTarget:0x0\nSelector:(null)'
  for (const [scenario, expected] of [
    ['custom', { id: 'first', action: custom }], ['button', { id: 'button-first', action: 'AXPress' }],
    ['description', { id: 'first', action: 'AXCustomAction1' }], ['missing', null], ['ambiguous', null],
  ] as const) {
    test(`native notification reader ${expected ? 'invokes only the titled notification Done' : 'refuses'} in the unconfirmed ${scenario} layout, an assumed tree until a signed macOS run records one`, () => {
      for (const invoke of ['1', '0']) {
        const capture = spawnSync(executable, [scenario, invoke], { encoding: 'utf8', timeout: 10000 })
        assert.equal(capture.status, 0, capture.stderr)
        const reply = JSON.parse(capture.stdout) as { found: boolean; invoked: boolean; action?: string; nodes?: { role: string; text: string }[]
          tree: { role: string; parent: number; text: string; actions: string[]; element?: unknown }[] }
        assert.equal(reply.found, expected !== null)
        assert.equal(reply.tree[0].role, 'AXApplication')
        assert.equal(reply.tree[0].parent, -1)
        assert.ok(reply.tree.slice(1).every((node, index) => node.parent >= 0 && node.parent <= index && !('element' in node)))
        assert.ok(reply.tree.some((node) => node.role === 'AXWindow'))
        assert.ok(reply.tree.some((node) => node.text.includes('Orbit acceptance') && node.role !== 'AXMenuBarItem'))
        if (scenario === 'custom') assert.ok(reply.tree.some((node) => node.actions.includes(custom)))
        assert.equal(reply.invoked, expected !== null && invoke === '1')
        assert.deepEqual(JSON.parse(capture.stderr), expected && invoke === '1' ? [expected] : [])
        if (expected) assert.equal(reply.action, expected.action)
        else {
          assert.ok(reply.nodes!.some(node => node.text.includes('Orbit acceptance')))
          assert.ok(!reply.nodes!.some(node => node.role.startsWith('AXMenuBar')))
        }
      }
    })
  }
  test('native window reader lists only the target process windows with layer and on-screen state', () => {
    const reader = join(directory, 'reader')
    const built = spawnSync('clang', ['-fobjc-arc', '-framework', 'AppKit', '-framework', 'ApplicationServices', fileURLToPath(new URL('./acceptance-ax.m', import.meta.url)), '-o', reader], { encoding: 'utf8', timeout: 30000 })
    assert.equal(built.status, 0, built.stderr)
    const capture = spawnSync(reader, [String(process.pid), 'windows'], { encoding: 'utf8', timeout: 10000 })
    assert.equal(capture.status, 0, capture.stderr)
    assert.deepEqual(JSON.parse(capture.stdout), { windows: [] })
    assert.equal(spawnSync(reader, ['1', 'notification', 'title'], { encoding: 'utf8', timeout: 10000 }).status, 2)
    assert.equal(spawnSync(reader, ['1', 'windows', 'extra'], { encoding: 'utf8', timeout: 10000 }).status, 2)
  })
}

test('PowerShell producer lists process windows, finds the installed executable and refuses an absent notification', { skip: process.platform !== 'win32' }, () => {
  const script = fileURLToPath(new URL('./acceptance-uia.ps1', import.meta.url))
  const run = (...args: string[]) => {
    const capture = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-File', script, ...args], { encoding: 'utf8', timeout: 60000 })
    assert.equal(capture.status, 0, capture.stderr)
    return JSON.parse(capture.stdout) as Record<string, unknown>
  }
  const windows = run('-TargetProcessId', String(process.pid), '-Command', 'windows').windows as { className: string; visible: boolean }[]
  assert.ok(Array.isArray(windows))
  assert.ok(windows.every(window => typeof window.className === 'string' && typeof window.visible === 'boolean'))
  assert.ok((run('-TargetProcessId', '0', '-Command', 'process', '-Executable', process.execPath).processIds as number[]).includes(process.pid))
  const absent = run('-TargetProcessId', String(process.pid), '-Command', 'notification', '-Title', `Orbit absent ${process.pid}`, '-Label', 'Done', '-Invoke')
  assert.equal(absent.found, false)
  assert.equal(absent.invoked, false)
  assert.ok(Array.isArray(absent.windows))
  assert.ok((absent.windows as { className: string; processId: number }[]).every(window => typeof window.className === 'string' && window.processId !== process.pid))
  assert.equal(absent.toast, undefined)
})

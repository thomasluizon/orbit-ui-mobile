import assert from 'node:assert/strict'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { createHash, generateKeyPairSync, verify } from 'node:crypto'
import { createServer as createHttpServer } from 'node:http'
import { EventEmitter } from 'node:events'
import { join } from 'node:path'
import { execFile, spawnSync } from 'node:child_process'
import { promisify } from 'node:util'
import { runInNewContext } from 'node:vm'
import { after, test } from 'node:test'
import { createAcceptanceHandler } from './acceptance-mock'
import { assertDoneDelivered, assertExpiredDone, visibleWindows } from './acceptance-contract.mjs'
import { apnsPayload, apnsProviderToken, apnsRequest, apsEnvironment, exercisePush, isWnsChannel, pushReadiness, repeatReminder,
  sendApns, sendWns, signedApsEnvironment, takePushCredentials, wnsAccessToken, wnsPayload } from './acceptance-push.mjs'
import { apsdApplication, apsdReceipt, apsdSummary, apsdTopicReceipt, capturePushDiagnostics, startPushServices } from './acceptance-platform.mjs'

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

// apsctl status lines as a hosted macos-latest runner printed them once apsd was loaded through launchd.
const apsdConnected = ['daemon status:                                Running', 'connection environment:                       production',
  '   connection status:                         Yes', '            server hostname:                  3-courier.push.apple.com',
  '   courier status:                            Unknown'].join('\n')

function pushServicesHost({ loaded = [] as string[], statuses = [apsdConnected] as string[], centre = ['', '2652'] } = {}) {
  const calls: string[] = []
  const host = {
    execute: async (command: string, argumentsList: string[]) => {
      const call = [command, ...argumentsList].join(' ')
      calls.push(call)
      if (argumentsList.includes('print')) {
        if (!loaded.some((service) => call.endsWith(service))) throw new Error(`Could not find service "${argumentsList.at(-1)}"`)
        return 'state = running'
      }
      if (command.endsWith('/apsctl')) {
        const status = statuses.length > 1 ? statuses.shift()! : statuses[0]!
        if (status.startsWith('Bad response')) throw new Error(status)
        return status
      }
      if (command === 'pgrep') { const ids = centre.length > 1 ? centre.shift()! : centre[0]!; if (!ids) throw new Error('exit 1'); return `${ids}\n` }
      return ''
    },
    waitFor: async (read: () => Promise<unknown>, label: string) => {
      for (let attempt = 0; attempt < 5; attempt++) { const value = await read(); if (value) return value }
      throw new Error(`Timed out waiting for ${label}`)
    },
  }
  return { host, calls }
}

// The macos-latest image ships one apsd identity in /Library/Keychains/apsd.keychain, so every runner presents the same token,
// the courier rolls it and apsd drops the reminder as "a completely unknown token". apsd must start without that keychain.
test('macOS push acceptance loads apsd from a fresh identity and Notification Center through launchd before it asks for a token', async () => {
  const unloaded = pushServicesHost({ statuses: ['Bad response from apsd: Connection invalid', apsdConnected] })
  const result = await startPushServices(unloaded.host, 501)
  const apsctl = '/System/Library/PrivateFrameworks/ApplePushService.framework/apsctl status'
  assert.deepEqual(unloaded.calls, [
    'sudo launchctl enable system/com.apple.apsd', 'sudo launchctl print system/com.apple.apsd',
    'sudo rm -f /Library/Keychains/apsd.keychain',
    'sudo launchctl bootstrap system /System/Library/LaunchDaemons/com.apple.apsd.plist', 'sudo launchctl kickstart system/com.apple.apsd',
    'sudo launchctl enable gui/501/com.apple.notificationcenterui.agent', 'launchctl print gui/501/com.apple.notificationcenterui.agent',
    'launchctl bootstrap gui/501 /System/Library/LaunchAgents/com.apple.notificationcenterui.plist',
    'launchctl kickstart gui/501/com.apple.notificationcenterui.agent', apsctl, apsctl, 'pgrep -x NotificationCenter', 'pgrep -x NotificationCenter'])
  assert.deepEqual(result, { apsd: ['daemon status: Running', 'connection environment: production', 'connection status: Yes',
    'server hostname: 3-courier.push.apple.com'] })
  // A running apsd keeps its identity in memory, so it stops before its keychain goes and loads again from the fresh one. A loaded
  // Notification Center is started again, never bootstrapped a second time.
  const loaded = pushServicesHost({ loaded: ['system/com.apple.apsd', 'gui/501/com.apple.notificationcenterui.agent'] })
  await startPushServices(loaded.host, 501)
  assert.deepEqual(loaded.calls.slice(0, 6), ['sudo launchctl enable system/com.apple.apsd', 'sudo launchctl print system/com.apple.apsd',
    'sudo launchctl bootout system/com.apple.apsd', 'sudo rm -f /Library/Keychains/apsd.keychain',
    'sudo launchctl bootstrap system /System/Library/LaunchDaemons/com.apple.apsd.plist', 'sudo launchctl kickstart system/com.apple.apsd'])
  assert.equal(loaded.calls.some((call) => call.includes('bootstrap gui/501')), false)
  assert.equal(loaded.calls.filter((call) => call.includes('kickstart')).length, 2)
  // apsd that never reaches the courier fails the phase with a named wait, before the Perfil switch asks for a token, and the
  // error keeps the last status apsd gave.
  const offline = pushServicesHost({ statuses: [apsdConnected.replace('Yes', 'No')] })
  await assert.rejects(() => startPushServices(offline.host, 501), (error: Error) => {
    assert.equal(error.message, 'Timed out waiting for apsd to connect to the APNs courier; last apsctl status: daemon status: Running; ' +
      'connection environment: production; connection status: No; server hostname: 3-courier.push.apple.com')
    return true
  })
  assert.equal(offline.calls.includes('pgrep -x NotificationCenter'), false)
  const invalid = pushServicesHost({ statuses: ['Bad response from apsd: Connection invalid'] })
  await assert.rejects(() => startPushServices(invalid.host, 501), /^Error: Timed out waiting for apsd to connect to the APNs courier; last apsctl status: Bad response from apsd: Connection invalid$/)
  assert.deepEqual(apsdSummary(`${'x'.repeat(400)}\n`), ['x'.repeat(300)])
})

// apsctl status on macOS: a named port block (local capture) and usernoted's block, which carries every app's alert topic
// with no port name, copied from the macos-latest installed acceptance artifact push-apsctl-status.log.
const usernotedBlock = [
  "      process:                                usernoted",
  "         process connection status:           Ok",
  "         process connected:                   Nov 9, 2026 at 6:19:52 AM (67.54 seconds ago)",
  "         user:                                501",
  "         token:                               Yes, {length = 80, bytes=<redacted>}",
  "         status change notifications:         Disabled",
  "         track acitivity presence:            Disabled",
  "         total incoming push notifications:   1",
  "            previous hour:                    1",
  "            previous day:                     1",
  "            last incoming push notification:  Nov 9, 2026 at 6:19:53 AM (66.62 seconds ago)",
  "         nonwaking topics:                    1",
  "            topic:                            org.useorbit.desktop.staging",
  "               status:                        Ok",
  "               dark-wake:                     Yes",
  "               incoming push notifications:   1",
  "                  previous hour:              1",
  "                  previous day:               1",
  "                  last incoming push:         Nov 9, 2026 at 6:19:53 AM (66.62 seconds ago)",
  "         ipc message queue status:            Ok",
  "            push notifications:               1",
  "            last push notification:           Nov 9, 2026 at 6:19:53 AM (66.62 seconds ago)",
  "            last push notification topic:     org.useorbit.desktop.staging",
  "            non-push ipc messages:            0",
  "            last ipc action:                  Nov 9, 2026 at 6:19:55 AM (65.16 seconds ago)",
  "            ipc messages sent:                5",
  "            last ipc message sent:            Nov 9, 2026 at 6:19:55 AM (65.16 seconds ago)",
  "            ipc messages queued:              5",
  "            ipc messages waiting in queue:    0",
  "            ipc messages skipped:             2",
  "            ipc messages acknowledged:        5",
  "            last ack from application:        Nov 9, 2026 at 6:19:55 AM (65.16 seconds ago)",
  "            ipc delivery success rate:        100% (5 of 5)",
]
const apsdStatusWithApplication = [apsdConnected,
  '      application port name:                  com.apple.seld.aps', '         process:                             seld',
  '         token:                               Yes, {length = 80, bytes=<38c1bc94 7c0ab960 070db071>}',
  '         enabled topics:                      1', '            topic:                            com.apple.seld.fake',
  '         ipc message queue status:            Ok', '            push notifications:               0',
  ...usernotedBlock, '   courier status:                            Connected'].join('\n')

test('macOS push diagnostics keep the app apsd block, the redacted status and the notification unified log', async () => {
  assert.equal(apsdApplication(apsdStatusWithApplication, 'org.example.absent'), null)
  const writes = new Map<string, string>()
  const calls: { command: string; argumentsList: string[]; log?: string }[] = []
  const host = {
    execute: async (command: string, argumentsList: string[], options: { log?: string } = {}) => {
      calls.push({ command, argumentsList, log: options.log })
      return command.endsWith('/apsctl') ? apsdStatusWithApplication : ''
    },
    writeFile: async (path: string, text: string) => { writes.set(path, text) },
  }
  const since = new Date(2026, 10, 8, 20, 29, 50)
  const result = await capturePushDiagnostics('/output', { topic: 'org.useorbit.desktop.staging', since }, host)
  assert.deepEqual(result, { apsdStatus: 'push-apsctl-status.log', unifiedLog: 'push-unified.log',
    apsdApplication: usernotedBlock.map((line) => line.trim().replace(/\s{2,}/g, ' ')) })
  const status = writes.get(join('/output', 'push-apsctl-status.log'))!
  assert.equal(status.includes('38c1bc94'), false, 'the artifacts never store a device token')
  assert.deepEqual(calls[1], { command: '/usr/bin/log', log: join('/output', 'push-unified.log'), argumentsList: ['show', '--start', '2026-11-08 20:29:50',
    '--style', 'compact', '--info', '--debug', '--predicate',
    'process == "apsd" OR process == "usernoted" OR process == "NotificationCenter" OR process == "orbit-desktop" OR subsystem == "com.apple.UserNotifications"'] })
  // A failed log read stays in the report and never replaces the phase's own failure.
  host.execute = async (command: string) => { if (command === '/usr/bin/log') throw new Error('log: Cannot open the log store'); return 'Bad response from apsd: Connection invalid' }
  const failed = await capturePushDiagnostics('/output', { topic: 'org.useorbit.desktop.staging', since }, host)
  assert.deepEqual(failed, { apsdStatus: 'push-apsctl-status.log', unifiedLog: 'push-unified.log', apsdApplication: null, unifiedError: 'log: Cannot open the log store' })
})

test('apsd receipt counts the incoming pushes and the last arrival for the registered topic only', async () => {
  assert.deepEqual(apsdTopicReceipt(apsdStatusWithApplication, 'org.useorbit.desktop.staging'),
    { count: 1, last: 'Nov 9, 2026 at 6:19:53\u202fAM (66.62 seconds ago)' })
  assert.deepEqual(apsdTopicReceipt(apsdStatusWithApplication, 'com.apple.seld.fake'), { count: 0, last: null })
  assert.deepEqual(apsdTopicReceipt('Bad response from apsd: Connection invalid', 'org.useorbit.desktop.staging'), { count: 0, last: null })
  const commands: string[][] = []
  const receipt = await apsdReceipt('org.useorbit.desktop.staging', { execute: async (command: string, argumentsList: string[]) => {
    commands.push([command, ...argumentsList])
    return apsdStatusWithApplication
  } })
  assert.equal(receipt.count, 1)
  assert.deepEqual(commands, [['/System/Library/PrivateFrameworks/ApplePushService.framework/apsctl', 'status']])
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

test('mock log names every reminder Done the shell sends, with its status, and leaves the harness state polls out', async () => {
  const written: string[] = []
  const write = process.stdout.write
  process.stdout.write = ((chunk: string | Uint8Array) => { written.push(String(chunk)); return true }) as typeof process.stdout.write
  try {
    await withAcceptanceMock(() => Date.parse('2026-11-08T12:00:00Z'), async (call) => {
      const { doneToken } = (await call('POST', '/_test/repeat-reminders', { habitId: pushHabit })).body as { doneToken: string }
      await call('POST', '/api/reminders/done', { token: doneToken })
      await call('POST', '/api/reminders/done', { token: doneToken })
      await call('GET', '/_test/habit-logs')
    })
  } finally { process.stdout.write = write }
  assert.deepEqual(written.filter((line) => line.startsWith('[mock] ')),
    ['[mock] POST /_test/repeat-reminders 200\n', '[mock] POST /api/reminders/done 200\n', '[mock] POST /api/reminders/done 400\n'])
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

// windows-unelevated.ps1 token records: the push shell's Safer standard-user token, and the activator client's token, which
// the same Safer computation gives the same SID, level, Administrators state and session. The argument keys follow the Done
// action that windows-latest posted (trees/notification-done-activator.json of run 42596523281).
const shellToken = { user: 'RUNNER\\runneradmin', sid: 'S-1-5-21-1-2-3-500', rid: 500, integrity: 'Medium', integrityRid: 0x2000, tokenIsElevated: true,
  administrators: 'denyOnly', session: 1 }
const activatorReply = (context: Record<string, unknown>, hresult: number) => ({
  harness: { ...shellToken, integrity: 'High', integrityRid: 0x3000, administrators: 'enabled' }, client: 5150,
  header: 'C:\\Program Files (x86)\\Windows Kits\\10\\Include\\10.0.26100.0\\um\\NotificationActivationCallback.h',
  registration: { appId: '{0F8FAD5B-D9CB-469F-A165-70867728950E}', clsid: '{7D1B6A3C-5E2F-4A80-9C11-2B3C4D5E6F71}',
    server: '"C:\\Orbit\\orbit-desktop.exe" ----AppNotificationActivated:' },
  argumentKeys: ['orbitAction', 'orbitNotice'], context, hresult })

function pushHarness(platform: 'win32' | 'darwin', overrides: { authorization?: boolean; logsAfterDone?: number; visibleAfterDone?: number; expiredLogs?: number; signIn?: boolean; credentials?: Record<string, string>; environment?: string | null; signed?: boolean; apnsDropped?: string; hostIntegrity?: string; doneLost?: boolean; activator?: (name: string) => Record<string, unknown> | Error | undefined } = {}) {
  const events: string[] = []
  let apsdCount = 0
  const records = new Map<string, unknown>()
  const logs: { habitId: string; source: string }[] = []
  const reminders = new Map<string, string>()
  const proxyEvents: Record<string, unknown> = {}
  let hidden = false
  let launchedVisible = 0
  let shellAlive = true
  let notified: { title: string; doneToken: string }[] = []
  const report: { push?: Record<string, unknown>; launchContexts: Record<string, unknown> } = { launchContexts: { push: { ...shellToken, source: 'shell' } } }
  // The shell's response to a Done click: the running shell logs once and stays hidden, and a stopped shell starts signed out.
  const click = (toast: { doneToken: string }) => {
    if (overrides.doneLost) return
    const habitId = reminders.get(toast.doneToken)!
    if (shellAlive) {
      proxyEvents.done = true
      for (let index = 0; index < (overrides.logsAfterDone ?? 1); index++) logs.push({ habitId, source: 'reminder-done' })
    } else {
      for (let index = 0; index < (overrides.expiredLogs ?? 0); index++) logs.push({ habitId, source: 'reminder-done' })
      launchedVisible = 1
      if (overrides.signIn !== false) proxyEvents['sign-in'] = { kind: 'sign-in', route: '/login', session: 401 }
    }
  }
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
    startPushServices: async () => { events.push('push services') },
    apsdReceipt: async (topic: string) => { events.push(`apsd ${topic}`); return { count: apsdCount, last: apsdCount ? 'just now' : null } },
    stop: async () => { events.push('stop'); shellAlive = false },
    adopt: (pid: number) => { events.push(`adopt ${pid}`) },
    findProcesses: async () => launchedVisible ? [77] : [],
    sender: async (kind: string) => {
      events.push(`sender ${kind}`)
      return async (reminder: { title: string; data: { doneToken: string } }) => {
        events.push(`deliver ${reminder.title}`)
        // A dropped push is one APNs accepted and never handed to the device, so neither apsd nor Notification Center sees it.
        if (overrides.apnsDropped && reminder.title.startsWith(`Orbit acceptance ${overrides.apnsDropped} `)) return { status: 200 }
        notified.push({ title: reminder.title, doneToken: reminder.data.doneToken })
        apsdCount++
        return { status: 200 }
      }
    },
    native: async (pid: number, command: string, options: { title?: string; label?: string; invoke?: boolean; openCenter?: boolean } = {}) => {
      events.push(`native ${pid} ${command}${options.invoke ? ' invoke' : ''}${options.label ? ` ${options.label}` : ''}`)
      if (command === 'close') { hidden = true; return { sent: 'close' } }
      if (command === 'activation') {
        // Shape of the acceptance-uia.ps1 activation reply: the OrbitIntegrity level and elevation per host and per shell instance.
        return { hosts: [{ processId: 996, name: 'explorer', integrity: overrides.hostIntegrity ?? 'Medium', elevated: overrides.hostIntegrity === 'High', error: null },
          { processId: 1204, name: 'WpnUserService_3a1f', integrity: null, elevated: false, error: 'Access is denied' }],
        instances: [{ processId: 41, parentProcessId: 7, commandLine: '"C:\\Orbit\\orbit-desktop.exe"', integrity: 'Medium', elevated: true, error: null }] }
      }
      if (command === 'windows') {
        const visible = pid === 77 ? launchedVisible : hidden ? (proxyEvents.done ? overrides.visibleAfterDone ?? 0 : 0) : 1
        return platform === 'win32' ? { windows: Array.from({ length: visible }, () => ({ className: 'Tauri Window', visible: true })) }
          : { windows: Array.from({ length: visible }, () => ({ layer: 0, onscreen: true })) }
      }
      if (command === 'notification') {
        if (options.label === 'Allow') {
          return overrides.authorization ? { found: true, invoked: true, role: 'AXGroup', action: 'Name:Allow\nTarget:0x0\nSelector:(null)', tree: [] }
            : { found: false, tree: [{ role: 'AXApplication', parent: -1, text: 'Notification Center' }] }
        }
        const toast = notified.find((entry) => entry.title === options.title)
        if (!toast) return { found: false, windows: [] }
        if (!options.invoke) return { found: true, invoked: false, title: toast.title }
        // A hosted Windows runner never delivers a UIA click on Done to the shell, so only macOS clicks through the reader.
        if (platform === 'darwin') click(toast)
        return { found: true, invoked: true, title: toast.title }
      }
      throw new Error(`Unexpected native command ${command}`)
    },
    // windows-unelevated.ps1 activate mode: it throws when the history holds no single toast with one action of that label.
    activate: async ({ name, title, label }: { name: string; title: string; label: string }) => {
      events.push(`activate ${name} ${label}`)
      const toast = notified.find((entry) => entry.title === title)
      if (!toast || label !== 'Done') throw new Error(`Expected one ${label} action on the toast titled ${title}, found 0`)
      const outcome = overrides.activator?.(name)
      if (outcome instanceof Error) throw outcome
      const reply = outcome ?? activatorReply(shellToken, 0)
      if (reply.hresult === 0 && !reply.error) click(toast)
      return reply
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
    if (platform === 'darwin') assert.ok(order('launch') < order('push services') && order('push services') < order('send push-enable:'))
    else assert.equal(harness.events.includes('push services'), false)
    // macOS clicks Done through the AX reader. Windows only finds the toast with its Done button, then the activator client
    // makes the click's Activate call, for the running shell and for the stopped one.
    const doneClick = platform === 'darwin' ? 'native 41 notification invoke Done' : 'activate notification-done-activator Done'
    const expiredClick = platform === 'darwin' ? 'native 0 notification invoke Done' : 'activate notification-expired-activator Done'
    assert.ok(order('native 41 close') < order('deliver Orbit acceptance done'))
    assert.ok(order('deliver Orbit acceptance done') < order(doneClick))
    if (platform === 'win32') {
      assert.ok(order('deliver Orbit acceptance done') < order('native 41 notification Done') && order('native 41 notification Done') < order(doneClick))
      assert.equal(harness.events.some((event) => event.includes('notification invoke')), false, 'no Windows UIA search invokes Done')
    }
    assert.ok(order('deliver Orbit acceptance expired') < order('stop'))
    assert.ok(order('stop') < order('session expired'))
    assert.ok(order('session expired') < order('reset {"expectAuthenticated":false,"reportSignIn":true}'))
    assert.ok(order('reset {"expectAuthenticated":false,"reportSignIn":true}') < order(expiredClick))
    assert.ok(order(expiredClick) < order('adopt 77'))
    const records = [...harness.records.keys()]
    assert.deepEqual(records, platform === 'darwin'
      ? ['notification-authorization', 'notification-done', 'notification-expired', 'notification-expired-signed-out']
      : ['notification-done', 'notification-done-activator', 'notification-done-activation', 'notification-expired', 'notification-expired-activator'])
    for (const [name, title] of [['notification-done', 'done'], ['notification-expired', 'expired'],
      ...(platform === 'darwin' ? [['notification-expired-signed-out', 'expired']] : [])]) {
      assert.match((harness.records.get(name!) as { title: string }).title, new RegExp(`^Orbit acceptance ${title} `), name)
    }
    if (platform === 'darwin') {
      assert.deepEqual((push as Record<string, unknown>).doneReceipt, { before: 0, after: 1, seconds: 0 })
      assert.deepEqual((push as Record<string, unknown>).expiredReceipt, { before: 1, after: 2, seconds: 0 })
      assert.ok(order('apsd org.useorbit.desktop.staging') < order('deliver Orbit acceptance done'))
    } else {
      assert.equal(harness.events.some((event) => event.startsWith('apsd ')), false)
      assert.deepEqual((push as Record<string, unknown>).activation, {
        hosts: [{ name: 'explorer', integrity: 'Medium', elevated: false }, { name: 'WpnUserService_3a1f', integrity: null, elevated: false, error: 'Access is denied' }],
        instances: [{ processId: 41, commandLine: '"C:\\Orbit\\orbit-desktop.exe"', integrity: 'Medium' }] })
      assert.ok(order(doneClick) < order('native 41 activation'))
      const activator = { hresult: 0, clsid: '{7D1B6A3C-5E2F-4A80-9C11-2B3C4D5E6F71}',
        header: 'C:\\Program Files (x86)\\Windows Kits\\10\\Include\\10.0.26100.0\\um\\NotificationActivationCallback.h',
        argumentKeys: ['orbitAction', 'orbitNotice'], client: { sid: 'S-1-5-21-1-2-3-500', integrity: 'Medium', administrators: 'denyOnly', session: 1 } }
      assert.deepEqual((push as Record<string, unknown>).activator, { 'notification-done-activator': activator, 'notification-expired-activator': activator })
    }
    if (platform === 'darwin') assert.equal(harness.events.some((event) => event.includes(' activation')), false)
    if (platform === 'darwin') {
      assert.deepEqual(harness.records.get('notification-authorization'), { found: false, tree: [{ role: 'AXApplication', parent: -1, text: 'Notification Center' }] })
      assert.deepEqual((push as Record<string, unknown>).authorization, { found: false })
    } else assert.equal((push as Record<string, unknown>).authorization, undefined)
  }
})

test('macOS push acceptance keeps the authorization alert it allowed, because the alert leaves the screen once allowed', async () => {
  const harness = pushHarness('darwin', { authorization: true })
  await exercisePush(harness.io)
  assert.deepEqual((harness.report.push as Record<string, unknown>).authorization,
    { found: true, invoked: true, role: 'AXGroup', action: 'Name:Allow\nTarget:0x0\nSelector:(null)' })
  assert.deepEqual([...harness.records.keys()].slice(0, 2), ['notification-authorization', 'notification-authorization-found'])
})

test('macOS push acceptance names the APNs hop when apsd never receives an accepted push, before it searches Notification Center', async () => {
  const harness = pushHarness('darwin', { apnsDropped: 'expired' })
  await assert.rejects(() => exercisePush(harness.io),
    /^Error: APNs accepted the expired reminder with HTTP 200, but apsd counted no new push for org\.useorbit\.desktop\.staging: 1 before and 1 after 60 s, last incoming push just now$/)
  const push = harness.report.push as Record<string, unknown>
  assert.deepEqual(push.done, { logs: 1, windowVisible: false })
  assert.deepEqual(push.expiredReceipt, { before: 1, after: 1, last: 'just now' })
  assert.equal(harness.records.has('notification-expired'), false, 'the search for a push the device never received does not run')
})

test('Windows push acceptance names the shell host levels and running instances when a Done activation never logs', async () => {
  const harness = pushHarness('win32', { doneLost: true, hostIntegrity: 'High' })
  await assert.rejects(() => exercisePush(harness.io), (error: Error) => {
    assert.equal(error.message, 'Timed out waiting for the Done habit log; shell hosts: explorer High elevated, WpnUserService_3a1f unreadable (Access is denied); running shell instances: 1 (pid 41 Medium)')
    return true
  })
  assert.deepEqual([...harness.records.keys()].slice(0, 4), ['notification-done', 'notification-done-activator', 'notification-done-activation',
    'notification-done-activation-timeout'])
  assert.equal((harness.report.push as Record<string, { instances: unknown[] }>).activationAfterTimeout.instances.length, 1)
})

const createFailure = 'CoCreateInstance({7D1B6A3C-5E2F-4A80-9C11-2B3C4D5E6F71}, CLSCTX_LOCAL_SERVER) failed with 0x80080005'
for (const [label, activator, message] of [
  ['a client that cannot create the activator', () => ({ ...activatorReply(shellToken, 0), hresult: undefined, error: createFailure }),
    /: the activator client failed: CoCreateInstance\(.*\) failed with 0x80080005; shell hosts: explorer High elevated, /],
  ['an Activate call that the shell refuses', () => activatorReply(shellToken, -2147467259),
    /: INotificationActivationCallback::Activate returned 0x80004005; shell hosts: explorer High elevated, /],
  ['a client token that is not the shell token', () => activatorReply({ ...shellToken, integrity: 'High', administrators: 'enabled' }, 0),
    /: the activator client token differs from the shell token in integrity \(High against Medium\), administrators \(enabled against denyOnly\); shell hosts: /],
  ['a client that records no token', () => ({ ...activatorReply(shellToken, 0), context: undefined }), /: the activator client reported no token; shell hosts: /],
] as const) {
  test(`Windows push acceptance fails the Done on ${label} and names the shell hosts`, async () => {
    const harness = pushHarness('win32', { hostIntegrity: 'High', activator: (name) => name === 'notification-done-activator' ? activator() : undefined })
    await assert.rejects(() => exercisePush(harness.io), (error: Error) => {
      assert.match(error.message, /^The Orbit acceptance done [0-9a-f]{8} Done activation failed: /)
      assert.match(error.message, message)
      assert.match(error.message, /running shell instances: 1 \(pid 41 Medium\)$/)
      return true
    })
    assert.deepEqual([...harness.records.keys()], ['notification-done', 'notification-done-activator', 'notification-done-activator-failure'])
    assert.equal(harness.events.some((event) => event.startsWith('deliver Orbit acceptance expired')), false)
  })
}

test('a failed expired-session activation leaves every shell that COM started to the phase cleanup', async () => {
  const timeout = 'Timed out waiting for the Medium-integrity notification-expired-activator client; client 5150 was still running and is stopped'
  const harness = pushHarness('win32', { activator: (name) => name === 'notification-expired-activator' ? new Error(timeout) : undefined })
  harness.io.findProcesses = async () => [77, 78]
  await assert.rejects(() => exercisePush(harness.io), new RegExp(`^Error: ${timeout}$`))
  assert.deepEqual(harness.events.filter((event) => event.startsWith('adopt ')), ['adopt 77', 'adopt 78'])
})

test('Windows push acceptance gives the activator the Done label of the reminder payload, never the localized shell label', async () => {
  const harness = pushHarness('win32')
  Object.assign(harness.io, { doneLabel: 'Concluir' })
  await exercisePush(harness.io)
  assert.deepEqual(harness.events.filter((event) => event.startsWith('activate ')),
    ['activate notification-done-activator Done', 'activate notification-expired-activator Done'])
})

test('push acceptance adopts the notification-launched shell before it waits for the sign-in page', async () => {
  const harness = pushHarness('win32', { signIn: false })
  await assert.rejects(() => exercisePush(harness.io), /Timed out waiting for the sign-in page after an expired-session Done/)
  assert.ok(harness.events.includes('adopt 77'), 'the phase cleanup stops the launched shell only when exercisePush adopted it')
})

test('push acceptance records every notification capture, also the ones that never match', async () => {
  const harness = pushHarness('win32')
  harness.io.sender = async () => async () => ({ status: 200 })
  // The Windows reader names the user's notification mode, because Do not disturb holds every banner back.
  const native = harness.io.native
  harness.io.native = async (...argumentsList: Parameters<typeof native>) => ({ ...await native(...argumentsList), notificationMode: 'PriorityOnly' })
  await assert.rejects(() => exercisePush(harness.io), /Timed out waiting for the Orbit acceptance done .* system notification/)
  assert.deepEqual(harness.records.get('notification-done'), { found: false, windows: [], notificationMode: 'PriorityOnly' })
  assert.equal(harness.events.filter((event) => event === 'record notification-done').length, 40)
  assert.equal(harness.report.push?.notificationMode, 'PriorityOnly')
})

test('push acceptance names the installed executable to the reader and keeps the last history reply of each search', async () => {
  const harness = pushHarness('win32')
  const executable = 'D:\\installed\\Orbit Staging\\orbit-desktop.exe'
  Object.assign(harness.io, { executable })
  const native = harness.io.native
  const executables: unknown[] = []
  const reads = new Map<string, number>()
  harness.io.native = async (pid: number, command: string, options: Parameters<typeof native>[2] & { executable?: string } = {}) => {
    const reply = await native(pid, command, options)
    if (command !== 'notification') return reply
    executables.push(options.executable)
    const read = (reads.get(options.title!) ?? 0) + 1
    reads.set(options.title!, read)
    // The history holds a posted toast before UIA lists its banner, so the first read of each search misses the toast.
    const found = reply.found === true && read > 1
    return { ...reply, found, history: { appId: '{0F8FAD5B-D9CB-469F-A165-70867728950E}', posted: reply.found === true, read,
      count: reply.found === true ? 1 : 0, titles: reply.found === true ? [options.title] : [] } }
  }
  await exercisePush(harness.io)
  assert.ok(executables.length > 0 && executables.every((value) => value === executable))
  const history = harness.report.push?.history as Record<string, { posted: boolean; read: number; titles: string[] }>
  // The activator client takes the expired Done from the same history, so no reader search follows the shell stop.
  assert.deepEqual(Object.keys(history), ['notification-done', 'notification-expired'])
  for (const [name, entry] of Object.entries(history)) {
    assert.equal(entry.posted, true, name)
    assert.equal(entry.read, 2, name)
    assert.match(entry.titles[0]!, /^Orbit acceptance (done|expired) /, name)
  }
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

import { EventEmitter } from 'node:events'
import { readFileSync } from 'node:fs'
import { IncomingMessage, ServerResponse } from 'node:http'
import { Socket } from 'node:net'
import { join, win32 } from 'node:path'
import { runInNewContext } from 'node:vm'
import { T, REPO_ROOT } from './_harness.mjs'

const runnerSource = () => readFileSync(join(REPO_ROOT, 'tools/desktop-bench/acceptance-runner.mjs'), 'utf8')

async function originCheckCases() {
  const source = runnerSource().slice(runnerSource().indexOf('export async function acceptance')).replace('export ', '')
  for (const addresses of [[], [{ address: '203.0.113.7', family: 4 }], [{ address: '127.0.0.1', family: 4 }],
    [{ address: '::1', family: 6 }], [{ address: '127.0.0.1', family: 4 }, { address: '::1', family: 6 }],
    [{ address: '127.0.0.1', family: 4 }, { address: '2001:db8::7', family: 6 }]]) {
    const isolated = addresses.length > 0 && addresses.every(({ address }) => ['127.0.0.1', '::1'].includes(address))
    const reachedProxy = new Error('origin check completed')
    let failure
    const context = { join, windows: true, directory: 'bench', process: { platform: 'win32', arch: 'x64', stdout: { write() {} } },
      mkdir: async () => {}, existsSync: () => false, assertFree: async () => {},
      startRecording: async () => async () => {}, buildInstaller: async () => ({}), hermeticServices: async () => {},
      nativeTool: async () => {}, updateServer: async () => ({ route() {} }),
      isolateOrigins: async () => ({ restore: async () => {} }), lookup: async () => addresses,
      startProxy: async () => { throw reachedProxy }, stopAll: async () => {}, rm: async () => {}, record: async () => {},
    }
    runInNewContext(`${source}\nglobalThis.acceptance = acceptance`, context)
    try { await context.acceptance({ repository: 'repository', output: 'output' }) } catch (error) { failure = error }
    T(`origin isolation ${isolated ? 'accepts' : 'rejects'} ${JSON.stringify(addresses)}`, isolated
      ? failure === reachedProxy
      : failure?.message.includes('Origin isolation failed for app-staging.useorbit.org') && failure.message.includes(JSON.stringify(addresses)))
  }
}

async function hostsReplacementCases() {
  const platformSource = readFileSync(join(REPO_ROOT, 'tools/desktop-bench/acceptance-platform.mjs'), 'utf8')
  const source = platformSource.slice(platformSource.indexOf('export async function isolateOrigins')).replace('export ', '')
  for (const windows of [false, true]) {
    for (const failAfterSwap of [false, true]) {
      const paths = windows ? win32 : { join }
      const hosts = windows ? paths.join('system', 'System32/drivers/etc/hosts') : '/etc/hosts'
      const original = '# original hosts\n127.0.0.1 localhost\n::1 localhost\n'
      const files = new Map([[hosts, original]])
      const calls = []
      const failure = new Error('certificate read failed after hosts swap')
      let swapped
      const copy = async (from, to) => { files.set(to, files.get(from)); calls.push(['copy', from, to]); if (to === hosts && from.endsWith('isolated-hosts')) swapped = files.get(to) }
      const context = { windows, join: paths.join, process: { env: { SystemRoot: 'system' } },
        X509Certificate: class { fingerprint = '00:11' },
        readFile: async (path) => { if (failAfterSwap && path.endsWith('server.key')) throw failure; return files.get(path) ?? 'certificate' },
        writeFile: async (path, value) => { files.set(path, value) }, copyFile: copy,
        execute: async (command, argumentsList) => {
          calls.push([command, ...argumentsList])
          if (command === 'sudo' && argumentsList[0] === 'cp') await copy(argumentsList[1], argumentsList[2])
        },
      }
      runInNewContext(`${source}\nglobalThis.isolateOrigins = isolateOrigins`, context)
      let isolation
      let rejected
      try { isolation = await context.isolateOrigins('output') } catch (error) { rejected = error }
      T(`${windows ? 'Windows' : 'macOS'} hosts replacement preserves the original and maps both hosts to both loopbacks`,
        swapped === `${original}\n127.0.0.1 app-staging.useorbit.org github.com\n::1 app-staging.useorbit.org github.com\n`)
      if (isolation) await isolation.restore()
      T('successful cleanup and partial setup failure restore the complete original hosts file',
        files.get(hosts) === original && (failAfterSwap ? rejected === failure : !rejected))
      const refreshes = calls.filter(([command, argument]) => command === 'ipconfig.exe' || command === 'sudo' && ['dscacheutil', 'killall'].includes(argument))
      const expected = windows ? [['ipconfig.exe', '/flushdns']] : [['sudo', 'dscacheutil', '-flushcache'], ['sudo', 'killall', '-HUP', 'mDNSResponder']]
      T(`${windows ? 'Windows' : 'macOS'} refreshes its resolver after the hosts swap and restoration`,
        JSON.stringify(refreshes) === JSON.stringify([...expected, ...expected]))
      T('cleanup removes the temporary certificate trust', calls.some(([command, ...argumentsList]) => windows
        ? command === 'certutil.exe' && argumentsList.join(',') === '-delstore,Root,0011'
        : command === 'sudo' && argumentsList.join(',') === 'security,delete-certificate,-Z,0011,/Library/Keychains/System.keychain'))
    }
  }
}

async function standaloneStartupCases() {
  const source = runnerSource().slice(runnerSource().indexOf('async function hermeticServices'), runnerSource().indexOf('async function updateServer'))
  const launches = []
  const copies = []
  const waits = []
  const context = { join, directory: 'bench', desktopOrigin: 'https://app-staging.useorbit.org',
    process: { execPath: process.execPath, env: { EXISTING_SETTING: 'retained' } }, require: { resolve: (name) => name },
    buildHermeticWeb: async () => {}, execute: async () => {}, readFixtures: async () => ({ token: 'fixture', fixtures: {} }),
    fetch: async () => ({ ok: true }), cp: async (...argumentsList) => { copies.push(argumentsList) },
    start: (command, argumentsList, options) => { const handle = { command, argumentsList, options }; launches.push(handle); return handle },
    waitForHttp: async (url, handle) => { waits.push({ url, handle }) },
  }
  runInNewContext(`${source}\nglobalThis.hermeticServices = hermeticServices`, context)
  await context.hermeticServices('repository', 'output')
  const web = launches.at(-1)
  const standalone = join('repository', 'apps/web/.next/standalone/apps/web')
  T('acceptance starts the generated standalone server with its supported host and port environment',
    web.command === process.execPath && web.argumentsList.join(',') === join(standalone, 'server.js') &&
    web.options.env.HOSTNAME === '127.0.0.1' && web.options.env.PORT === '3401' && web.options.env.EXISTING_SETTING === 'retained')
  T('standalone startup copies public and compiled static assets to the generated app directory',
    JSON.stringify(copies) === JSON.stringify([
      [join('repository', 'apps/web/public'), join(standalone, 'public'), { recursive: true }],
      [join('repository', 'apps/web/.next/static'), join(standalone, '.next/static'), { recursive: true }],
    ]))
  T('standalone startup still waits for the web health endpoint on its owned process',
    waits.at(-1).url === 'http://127.0.0.1:3401/api/health' && waits.at(-1).handle === web)
}

async function proxyErrorCases() {
  const source = readFileSync(join(REPO_ROOT, 'tools/desktop-bench/server.mjs'), 'utf8')
    .replace(/^import .*$/gm, '').replace('export async function', 'async function')
  for (const phase of ['before-headers', 'request-after-headers', 'response-after-headers']) {
    let handler
    let receiveUpstream
    const bindings = []
    const closed = []
    const proxyRequest = new EventEmitter()
    const server = (callback) => {
      handler = callback
      const listener = { once() {}, listen(port, host, ready) { bindings.push([port, host]); ready() },
        closeAllConnections() {}, close(complete) { closed.push(listener); complete?.() } }
      return listener
    }
    const context = { benchmarkViewport: [900, 600], readFile: async () => '',
      createServer: server, createSecureServer: (tls, callback) => server(callback),
      request: (options, callback) => { receiveUpstream = callback; return proxyRequest },
    }
    runInNewContext(`${source}\nglobalThis.startProxy = startProxy`, context)
    const proxy = await context.startProxy({ probePath: 'probe', port: 443, upstreamPort: 3401, tls: {} })
    const incoming = new IncomingMessage(new Socket())
    incoming.method = 'POST'
    incoming.url = '/api/auth/verify-code?token=private-query'
    incoming.headers = { host: 'app-staging.useorbit.org', cookie: 'private-cookie', authorization: 'Bearer private-token' }
    incoming.pipe = () => proxyRequest
    const response = new ServerResponse(incoming)
    await handler(incoming, response)
    const upstream = new IncomingMessage(new Socket())
    upstream.statusCode = 200
    upstream.headers = { 'content-type': 'application/json' }
    if (phase !== 'before-headers') receiveUpstream(upstream)
    const failure = new Error('socket hang up')
    let thrown
    try { (phase === 'response-after-headers' ? upstream : proxyRequest).emit('error', failure) } catch (error) { thrown = error }
    T(`proxy ${phase} handles the upstream error without throwing`, !thrown, thrown?.stack)
    T(`proxy ${phase} ${phase === 'before-headers' ? 'returns 502' : 'destroys the started response'}`,
      phase === 'before-headers' ? response.statusCode === 502 && response.writableEnded : response.statusCode === 200 && response.destroyed)
    const events = proxy.events()
    T('each upstream failure records method and path without query, credentials or request content', events.some((event) =>
      event.kind === 'error' && event.method === 'POST' && event.path === '/api/auth/verify-code' &&
      event.message.includes('POST /api/auth/verify-code') && event.message.includes(failure.message)) && !JSON.stringify(events).includes('private-'))
    let acceptanceFailure
    try { proxy.read('hoje') } catch (error) { acceptanceFailure = error }
    T('upstream failures still fail acceptance with the affected request', acceptanceFailure?.message.includes('POST /api/auth/verify-code'))
    T('TLS proxy accepts both loopbacks for isolated origins', JSON.stringify(bindings) === JSON.stringify([[443, '127.0.0.1'], [443, '::1']]))
    await proxy.stop()
    T('TLS proxy cleanup closes both listeners', closed.length === 2)
    upstream.destroy()
    incoming.destroy()
  }
}

export async function networkCases() {
  await originCheckCases()
  await hostsReplacementCases()
  await standaloneStartupCases()
  await proxyErrorCases()
}

import { EventEmitter } from 'node:events'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { chmod, mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { IncomingMessage, ServerResponse } from 'node:http'
import { Socket } from 'node:net'
import { join, win32 } from 'node:path'
import { runInNewContext } from 'node:vm'
import { T, REPO_ROOT, root } from './_harness.mjs'
import { dnsCases } from './desktop-acceptance-dns.mjs'

const runnerSource = () => readFileSync(join(REPO_ROOT, 'tools/desktop-bench/acceptance-runner.mjs'), 'utf8')

async function originCheckCases() {
  const platformSource = readFileSync(join(REPO_ROOT, 'tools/desktop-bench/acceptance-platform.mjs'), 'utf8')
  const source = platformSource.slice(platformSource.indexOf('export async function waitForIsolatedOrigins')).replace('export ', '')
  for (const addresses of [[], [{ address: '203.0.113.7', family: 4 }], [{ address: '127.0.0.1', family: 4 }],
    [{ address: '::1', family: 6 }], [{ address: '127.0.0.1', family: 4 }, { address: '::1', family: 6 }],
    [{ address: '127.0.0.1', family: 4 }, { address: '2001:db8::7', family: 6 }]]) {
    const isolated = addresses.length > 0 && addresses.every(({ address }) => ['127.0.0.1', '::1'].includes(address))
    let elapsed = 0
    let completed = false
    let failure
    const context = { Date: { now: () => elapsed }, delay: async (milliseconds) => { elapsed += milliseconds },
    }
    runInNewContext(`${source}\nglobalThis.waitForIsolatedOrigins = waitForIsolatedOrigins`, context)
    try { await context.waitForIsolatedOrigins(async () => {}, async () => addresses); completed = true } catch (error) { failure = error }
    T(`origin isolation ${isolated ? 'accepts' : 'rejects'} ${JSON.stringify(addresses)}`, isolated
      ? completed && !failure
      : !completed && failure?.message.includes('Origin isolation failed for app-staging.useorbit.org') && failure.message.includes(JSON.stringify(addresses)))
  }
}

async function hostsReplacementCases() {
  const platformSource = readFileSync(join(REPO_ROOT, 'tools/desktop-bench/acceptance-platform.mjs'), 'utf8')
  const source = platformSource.slice(platformSource.indexOf('export async function isolateOrigins')).replaceAll('export ', '')
  for (const failAfterSwap of [false, true]) {
    const hosts = win32.join('system', 'System32/drivers/etc/hosts')
    const original = '# original hosts\n127.0.0.1 localhost\n::1 localhost\n'
    const files = new Map([[hosts, original]])
    const calls = []
    const failure = new Error('certificate read failed after hosts swap')
    let swapped
    const copy = async (from, to) => { files.set(to, files.get(from)); calls.push(['copy', from, to]); if (to === hosts && from.endsWith('isolated-hosts')) swapped = files.get(to) }
    const context = { windows: true, join: win32.join, process: { env: { SystemRoot: 'system' } },
      X509Certificate: class { fingerprint = '00:11' },
      lookup: async () => [{ address: '127.0.0.1', family: 4 }, { address: '::1', family: 6 }],
      readFile: async (path) => { if (failAfterSwap && path.endsWith('server.key')) throw failure; return files.get(path) ?? 'certificate' },
      writeFile: async (path, value) => { files.set(path, value) }, copyFile: copy,
      execute: async (command, argumentsList) => { calls.push([command, ...argumentsList]) },
    }
    runInNewContext(`${source}\nglobalThis.isolateOrigins = isolateOrigins`, context)
    let isolation
    let rejected
    try { isolation = await context.isolateOrigins('output') } catch (error) { rejected = error }
    T('Windows hosts replacement preserves the original and maps both hosts to both loopbacks',
      swapped === `${original}\n127.0.0.1 app-staging.useorbit.org github.com\n::1 app-staging.useorbit.org github.com\n`)
    if (isolation) await isolation.restore()
    T('successful cleanup and partial setup failure restore the complete original hosts file',
      files.get(hosts) === original && (failAfterSwap ? rejected === failure : !rejected))
    const refreshes = calls.filter(([command]) => command === 'ipconfig.exe')
    T('Windows refreshes its resolver after the hosts swap and restoration',
      JSON.stringify(refreshes) === JSON.stringify([['ipconfig.exe', '/flushdns'], ['ipconfig.exe', '/flushdns']]))
    T('cleanup removes the temporary Windows certificate trust', calls.some(([command, ...argumentsList]) =>
      command === 'certutil.exe' && argumentsList.join(',') === '-delstore,Root,0011'))
  }
}

async function resolverReloadCases() {
  const platformSource = readFileSync(join(REPO_ROOT, 'tools/desktop-bench/acceptance-platform.mjs'), 'utf8')
  const source = platformSource.slice(platformSource.indexOf('export async function isolateOrigins')).replaceAll('export ', '')
  const publicAddresses = [{ address: '203.0.113.7', family: 4 }]
  const loopbacks = [{ address: '127.0.0.1', family: 4 }, { address: '::1', family: 6 }]
  for (const settleAfter of [1500, 12000, Infinity]) {
    const converges = Number.isFinite(settleAfter)
    let elapsed = 0
    let attempts = 0
    let refreshes = 0
    let restored = false
    let removedTrust = false
    const resolved = []
    const diagnostics = []
    const files = new Map()
    const logFailure = new Error('unified log capture denied')
    const context = {
      windows: false, join, process: { env: {} }, Date: { now: () => elapsed },
      X509Certificate: class { fingerprint = '00:11' },
      stat: async () => { throw Object.assign(new Error('missing'), { code: 'ENOENT' }) },
      startLoopbackDns: async () => ({ port: 53535, record: async () => {}, stop: async () => {} }),
      readFile: async () => 'certificate', writeFile: async (path, content) => { files.set(path, content) },
      execute: async (command, argumentsList, options) => {
        if (argumentsList[0] === 'dscacheutil' || argumentsList[0] === 'killall') refreshes++
        if (argumentsList[0] === 'rm' && argumentsList.at(-1).startsWith('/etc/resolver/')) restored = true
        if (argumentsList[0] === 'security' && argumentsList[1] === 'delete-certificate') removedTrust = true
        if (options?.log.includes('origin-isolation-')) {
          diagnostics.push({ command, argumentsList, log: options.log, restored })
          files.set(options.log, `captured ${command}`)
          if (command === '/usr/bin/log') throw logFailure
        }
      },
      delay: async (milliseconds) => { elapsed += milliseconds },
      lookup: async (hostname, options) => {
        if (hostname === 'app-staging.useorbit.org') attempts++
        resolved.push({ hostname, options, refreshes })
        return elapsed >= settleAfter ? loopbacks : publicAddresses
      },
    }
    runInNewContext(`${source}\nglobalThis.isolateOrigins = isolateOrigins`, context)
    let isolation
    let failure
    try { isolation = await context.isolateOrigins('output') } catch (error) { failure = error }
    if (converges) {
      T(`origin isolation observes per-domain resolver propagation after ${settleAfter} ms without cache purges`,
        !failure && isolation && elapsed === settleAfter && attempts === settleAfter / 250 + 1 && resolved.length === attempts * 2,
        failure?.message ?? JSON.stringify(resolved))
      T('every lookup requests all address families without purging macOS caches',
        resolved.every(({ options, refreshes }) => options.all === true && refreshes === 0))
      T('successful origin isolation does not collect failure diagnostics', diagnostics.length === 0)
      await isolation?.restore()
    } else {
      T('origin isolation fails at its deadline with each hostname and the observed addresses',
        !isolation && failure?.message.includes(`app-staging.useorbit.org: ${JSON.stringify(publicAddresses)}`) &&
        failure.message.includes(`github.com: ${JSON.stringify(publicAddresses)}`) && elapsed >= 30000 && elapsed <= 30250,
        failure?.message ?? `returned before isolation after ${attempts} lookups`)
      T('failed origin isolation never purges the macOS resolver', refreshes === 0)
      const expectedCommands = [
        ['ls', ['-le@', '/etc/resolver']], ['cat', ['/etc/resolver/app-staging.useorbit.org']],
        ['cat', ['/etc/resolver/github.com']], ['scutil', ['--dns']],
        ['dscacheutil', ['-q', 'host', '-a', 'name', 'app-staging.useorbit.org']],
        ['/usr/bin/log', ['show', '--last', '2m', '--predicate', 'process == "mDNSResponder"']],
      ]
      T('failed origin isolation captures resolver files, permissions, lookup and daemon logs before restoration',
        JSON.stringify(diagnostics.map(({ command, argumentsList }) => [command, argumentsList])) === JSON.stringify(expectedCommands) &&
        diagnostics.every(({ restored, log }) => !restored && log.endsWith('.log') && files.has(log)))
      const summary = JSON.parse(files.get(join('output', 'origin-isolation-diagnostics.log')) ?? 'null')
      T('a diagnostic command failure is recorded without hiding isolation failure or skipping other captures',
        summary?.error === failure?.message && summary?.commands.length === 6 &&
        summary.commands.filter(({ error }) => error !== null).length === 1 &&
        summary.commands.at(-1).error.includes(logFailure.message))
      T('origin isolation deadline still restores resolver files and certificate trust', restored && removedTrust)
    }
  }
}

async function macResolverConfigurationCases() {
  const platformSource = readFileSync(join(REPO_ROOT, 'tools/desktop-bench/acceptance-platform.mjs'), 'utf8')
  const source = platformSource.slice(platformSource.indexOf('export async function isolateOrigins')).replaceAll('export ', '')
  for (const directoryExists of [false, true]) {
    for (const failurePoint of [undefined, 'second-resolver', 'key', 'restore', 'responder']) {
      const hostnames = ['app-staging.useorbit.org', 'github.com']
      const existing = '/etc/resolver/app-staging.useorbit.org'
      const original = 'nameserver 192.0.2.8\nport 5300\n'
      const files = new Map([['/etc/hosts', 'original hosts'], ...(directoryExists ? [[existing, original]] : [])])
      const directories = new Set(directoryExists ? ['/etc/resolver'] : [])
      const configurations = []
      const calls = []
      const failure = new Error(`setup failed at ${failurePoint}`)
      let stopped = false
      let listening = false
      const context = { windows: false, join, process: { env: {} },
        X509Certificate: class { fingerprint = '00:11' },
        lookup: async () => [{ address: '127.0.0.1', family: 4 }, { address: '::1', family: 6 }],
        stat: async (path) => { if (!files.has(path) && !directories.has(path)) throw Object.assign(new Error('missing'), { code: 'ENOENT' }); return {} },
        readFile: async (path) => { if (failurePoint === 'key' && path.endsWith('server.key')) throw failure; return files.get(path) ?? 'certificate' },
        writeFile: async (path, value) => { files.set(path, value) },
        startLoopbackDns: async () => { listening = true; return { port: 53535, record: async () => {}, stop: async () => { stopped = true; if (failurePoint === 'responder') throw failure } } },
        execute: async (command, argumentsList) => {
          calls.push([command, ...argumentsList])
          if (command !== 'sudo') return
          const [operation, ...operands] = argumentsList
          if (operation === 'mkdir') directories.add(operands.at(-1))
          if (operation === 'rmdir') directories.delete(operands.at(-1))
          if (operation === 'rm') {
            files.delete(operands.at(-1))
            if (failurePoint === 'restore' && operands.at(-1).endsWith('github.com')) throw failure
          }
          if (operation !== 'cp') return
          const [from, to] = operands.filter((operand) => operand !== '-p')
          files.set(to, files.get(from))
          if (hostnames.some((hostname) => to === `/etc/resolver/${hostname}`) && !from.includes('original-resolver-')) {
            configurations.push({ path: to, content: files.get(to), listening })
            if (failurePoint === 'second-resolver' && to.endsWith('github.com')) throw failure
          }
        },
      }
      runInNewContext(`${source}\nglobalThis.isolateOrigins = isolateOrigins`, context)
      let isolation
      let rejected
      try { isolation = await context.isolateOrigins('output') } catch (error) { rejected = error }
      T('macOS installs per-domain resolvers only after its loopback DNS responder is listening',
        configurations.length === 2 && configurations.every(({ content, listening }) => listening && content === 'nameserver 127.0.0.1\nport 53535\n'))
      const cleanupFailure = ['restore', 'responder'].includes(failurePoint)
      if (isolation) { try { await isolation.restore() } catch (error) { rejected = error } }
      T('macOS restores existing resolver bytes and removes only resolver files and directories it created',
        files.get(existing) === (directoryExists ? original : undefined) && !files.has('/etc/resolver/github.com') && directories.has('/etc/resolver') === directoryExists)
      T('macOS preserves existing resolver metadata through its backup and restoration', !directoryExists ||
        calls.filter(([command, operation, flag]) => command === 'sudo' && operation === 'cp' && flag === '-p').length === 2)
      T('macOS resolver success and partial setup failures release DNS and temporary certificate trust',
        stopped && calls.some(([command, operation, action]) => command === 'sudo' && operation === 'security' && action === 'delete-certificate') &&
        (cleanupFailure ? rejected?.message.includes('cleanup failed') : failurePoint ? rejected === failure : !rejected))
      T('macOS origin isolation never rewrites hosts or purges the resolver cache', files.get('/etc/hosts') === 'original hosts' &&
        !calls.some(([command, operation]) => command === 'sudo' && ['dscacheutil', 'killall'].includes(operation)))
    }
  }
}

async function resolverFilesystemCases() {
  const platformSource = readFileSync(join(REPO_ROOT, 'tools/desktop-bench/acceptance-platform.mjs'), 'utf8')
  const source = platformSource.slice(platformSource.indexOf('export async function isolateOrigins')).replaceAll('export ', '')
  const fixture = join(root, 'desktop-acceptance-resolver-files')
  const output = join(fixture, 'output')
  const resolvers = join(fixture, 'resolver')
  const existing = join(resolvers, 'app-staging.useorbit.org')
  const original = Buffer.from('nameserver 192.0.2.8\r\nport 5300\r\n')
  await mkdir(output, { recursive: true })
  await mkdir(resolvers)
  await writeFile(existing, original)
  await chmod(existing, 0o640)
  const redirect = (path) => path.replace(/^\/etc\/resolver(?=\/|$)/, resolvers)
  const commands = []
  const context = { windows: false, join, process: { env: {} },
    X509Certificate: class { fingerprint = '00:11' },
    lookup: async () => [{ address: '127.0.0.1', family: 4 }],
    stat: (path) => stat(redirect(path)), writeFile,
    readFile: async (path) => path.endsWith('.pem') || path.endsWith('.key') ? 'certificate' : readFile(redirect(path)),
    startLoopbackDns: async () => ({ port: 53535, record: async () => {}, stop: async () => {} }),
    execute: async (command, argumentsList) => {
      if (command !== 'sudo' || argumentsList[0] === 'security') return
      const [operation, ...operands] = argumentsList
      const result = spawnSync(operation, operands.map(redirect), { encoding: 'utf8' })
      commands.push({ operation, status: result.status })
      if (result.status !== 0) throw new Error(result.stderr)
    },
  }
  runInNewContext(`${source}\nglobalThis.isolateOrigins = isolateOrigins`, context)
  const isolation = await context.isolateOrigins(output)
  T('real resolver files contain only the documented loopback nameserver and owned port',
    (await readFile(existing, 'utf8')) === 'nameserver 127.0.0.1\nport 53535\n' &&
    (await readFile(join(resolvers, 'github.com'), 'utf8')) === 'nameserver 127.0.0.1\nport 53535\n')
  await isolation.restore()
  T('real cp preserves original resolver bytes and mode while cleanup removes the new resolver',
    (await readFile(existing)).equals(original) && ((await stat(existing)).mode & 0o777) === 0o640 &&
    await stat(join(resolvers, 'github.com')).then(() => false, (error) => error.code === 'ENOENT'))
  T('resolver backup and restoration use installed filesystem commands successfully', commands.length === 5 && commands.every(({ status }) => status === 0))
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
  await dnsCases()
  await originCheckCases()
  await hostsReplacementCases()
  await resolverReloadCases()
  await macResolverConfigurationCases()
  if (process.platform !== 'win32') await resolverFilesystemCases()
  await standaloneStartupCases()
  await proxyErrorCases()
}

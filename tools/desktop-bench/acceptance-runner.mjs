import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { lookup } from 'node:dns/promises'
import { request as requestHttp } from 'node:http'
import { buildHermeticWeb } from './runner.mjs'
import { readFixtures } from './build.mjs'
import { startProxy } from './server.mjs'
import { assertFree, execute, start, stopAll, waitFor, waitForHttp } from './host.mjs'
import { buildInstaller, desktopOrigin, install, isolateOrigins, startRecording } from './acceptance-platform.mjs'
import { assertAccessibleTree, assertCookieEvidence, assertPaletteFocus, corruptSignature } from './acceptance-contract.mjs'

const require = createRequire(import.meta.url)
const directory = dirname(fileURLToPath(import.meta.url))
const windows = process.platform === 'win32'
const record = (path, value) => writeFile(path, `${JSON.stringify(value, null, 2)}\n`)

async function nativeTool(output) {
  const executable = join(output, 'accessibility')
  if (!windows) await execute('clang', ['-fobjc-arc', '-framework', 'AppKit', '-framework', 'ApplicationServices', join(directory, 'acceptance-ax.m'), '-o', executable])
  return async (pid, command) => {
    const reply = windows
      ? await execute('powershell.exe', ['-NoProfile', '-NonInteractive', '-File', join(directory, 'acceptance-uia.ps1'), '-TargetProcessId', String(pid), '-Command', command])
      : await execute(executable, [String(pid), command])
    return reply.trim() ? JSON.parse(reply) : null
  }
}

async function hermeticServices(repository, output) {
  const environment = { ...process.env, API_BASE: 'http://127.0.0.1:5099', NEXT_PUBLIC_EVENT_API_BASE: desktopOrigin, NEXT_PUBLIC_SITE_URL: desktopOrigin, HERMETIC_DESKTOP_ORIGIN: desktopOrigin, LAYOUT_PORT: '3400', NEXT_TELEMETRY_DISABLED: '1' }
  await buildHermeticWeb(repository, output, environment)
  const fixturesPath = join(output, 'fixtures.json')
  await execute(process.execPath, ['--import', 'tsx', join(directory, 'fixtures.ts'), fixturesPath], { cwd: repository, env: environment })
  const fixtures = await readFixtures(fixturesPath)
  const mock = start(process.execPath, ['--import', 'tsx', join(directory, 'acceptance-mock.ts'), fixturesPath], { cwd: repository, env: environment, log: join(output, 'mock.log') })
  await waitForHttp('http://127.0.0.1:5099/health', mock)
  const seed = await fetch('http://127.0.0.1:5099/_test/session-fixtures', { method: 'PUT', headers: { Authorization: `Bearer ${fixtures.token}`, 'content-type': 'application/json' }, body: JSON.stringify({ fixtures: fixtures.fixtures }) })
  if (!seed.ok) throw new Error(`Hermetic seed failed: ${seed.status}`)
  const web = start(process.execPath, [require.resolve('next/dist/bin/next'), 'start', '--port', '3401', '--hostname', '127.0.0.1'], { cwd: join(repository, 'apps/web'), env: environment, log: join(output, 'web.log') })
  await waitForHttp('http://127.0.0.1:3401/api/health', web)
}

async function updateServer(repository, output, shell, report) {
  const { buildManifest, artifactName, verifyArtifact } = await import(join(repository, 'apps/desktop/scripts/release.ts'))
  const signatures = Object.fromEntries(['aarch64-apple-darwin', 'x86_64-apple-darwin', 'x86_64-pc-windows-msvc', 'aarch64-pc-windows-msvc']
    .map((target) => [artifactName('staging', '2.0.0', target), shell.signature]))
  const valid = buildManifest('staging', '2.0.0', signatures)
  const bad = structuredClone(valid)
  for (const platform of Object.values(bad.platforms)) platform.signature = corruptSignature(platform.signature)
  const bytes = await readFile(shell.packagePath)
  verifyArtifact(bytes, shell.signature, shell.publicKey, '2.0.0')
  const manifest = join(output, 'latest.json')
  await record(manifest, valid)
  await execute(process.execPath, [require.resolve('@tauri-apps/cli/tauri.js'), 'signer', 'sign', '--app-version', '2.0.0', manifest], {
    env: { ...process.env, TAURI_SIGNING_PRIVATE_KEY_PATH: join(output, 'updater.key'), TAURI_SIGNING_PRIVATE_KEY_PASSWORD: '' }, log: join(output, 'manifest-signing.log'),
  })
  const manifestSignature = (await readFile(`${manifest}.sig`, 'utf8')).trim()
  verifyArtifact(await readFile(manifest), manifestSignature, shell.publicKey, '2.0.0')
  let mode = 'off'
  const cookies = []
  let authenticated = false
  const route = (request, response) => {
    const hostname = request.headers.host
    if (hostname === 'github.com') {
      report.updateRequests.push({ mode, path: request.url })
      if (request.url === '/thomasluizon/orbit-ui-mobile/releases/download/desktop-staging/latest.json') {
        if (mode === 'off') response.writeHead(204).end()
        else response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(mode === 'bad' ? bad : valid))
      } else if (request.url === '/thomasluizon/orbit-ui-mobile/releases/download/desktop-staging/latest.json.sig') {
        response.writeHead(200).end(manifestSignature)
      } else if (Object.values(valid.platforms).some((platform) => new URL(platform.url).pathname === request.url)) {
        response.writeHead(200, { 'content-type': 'application/octet-stream', 'content-length': bytes.length }).end(bytes)
      } else response.writeHead(404).end()
      return true
    }
    if (hostname !== new URL(desktopOrigin).hostname) { response.writeHead(421).end(); return true }
    if (request.url.startsWith('/api/events?')) {
      const events = requestHttp({ host: '127.0.0.1', port: 5099, path: request.url, method: 'GET' }, (upstream) => {
        response.writeHead(upstream.statusCode, upstream.headers)
        upstream.pipe(response)
        response.on('close', () => upstream.destroy())
      })
      events.on('error', (error) => response.destroy(error))
      events.end()
      return true
    }
    if (request.headers.cookie?.includes('auth_token=') && !request.url.startsWith('/_bench/')) authenticated = true
    return false
  }
  route.observe = (request, upstream) => {
    if (request.url === '/api/auth/verify-code' && upstream.statusCode === 200) cookies.push(...(upstream.headers['set-cookie'] ?? []))
  }
  return { route, mode(value) { mode = value }, cookieEvidence() { assertCookieEvidence(cookies, authenticated); return { httpOnly: true, secure: true, sameSite: 'strict', authenticatedRequest: true } } }
}

async function inspectSurfaces(proxy, native, handle, output, report) {
  const dump = async (surface) => {
    const tree = await native(handle.child.pid, 'dump')
    await record(join(output, 'trees', `${surface}.json`), tree)
    report.accessibility[surface] = assertAccessibleTree(tree, process.platform)
    return tree
  }
  await dump('hoje')
  proxy.send('astra')
  await waitFor(() => proxy.read('astra'), 'Astra surface')
  await dump('astra')
  proxy.send('palette')
  let previous = await waitFor(() => proxy.read('palette'), 'palette surface')
  const tree = await dump('palette')
  if (tree.denied) { report.paletteFocus = { skipped: tree.error }; return }
  const focus = []
  for (let index = 0; index < 2; index++) {
    await native(handle.child.pid, 'down')
    const before = proxy.events().filter((event) => event.kind === 'focus').length
    proxy.send('focus')
    const current = await waitFor(() => proxy.events().filter((event) => event.kind === 'focus')[before], 'palette result focus')
    const selectedTree = await dump(`palette-result-${index + 1}`)
    assertPaletteFocus(previous, current, selectedTree)
    focus.push(current)
    previous = current
  }
  report.paletteFocus = focus
  await native(handle.child.pid, 'escape')
}

function installedLaunch(executable, output, name) {
  const environment = { ...process.env }
  for (const key of ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'http_proxy', 'https_proxy', 'all_proxy']) delete environment[key]
  return start(executable, [], { env: environment, log: join(output, `${name}.log`) })
}

async function quit(native, handle) {
  await native(handle.child.pid, windows ? 'quit' : 'terminate')
  await waitFor(() => handle.child.exitCode !== null, 'clean installed app exit', 30000)
  await handle.done
}

export async function acceptance({ repository, output }) {
  await mkdir(join(output, 'trees'), { recursive: true })
  const report = { platform: process.platform, architecture: process.arch, accessibility: {}, updateRequests: [], passed: false }
  const nextOutput = join(repository, 'apps/web/.next')
  let finishRecording
  let isolation
  let proxy
  let builtWeb = false
  try {
    if (existsSync(nextOutput)) throw new Error('Acceptance requires a fresh hermetic web build')
    for (const port of [443, 5099, 3401]) await assertFree(port)
    finishRecording = await startRecording(output)
    process.stdout.write('Building release-shaped installer and hermetic web application\n')
    const shell = await buildInstaller(repository, output)
    builtWeb = true
    await hermeticServices(repository, output)
    const native = await nativeTool(output)
    const updates = await updateServer(repository, output, shell, report)
    isolation = await isolateOrigins(output)
    for (const hostname of ['app-staging.useorbit.org', 'github.com']) {
      const addresses = await lookup(hostname, { all: true })
      if (!addresses.length || addresses.some((entry) => entry.address !== '127.0.0.1')) throw new Error(`Origin isolation failed for ${hostname}`)
    }
    proxy = await startProxy({ probePath: join(directory, 'acceptance-probe.js'), port: 443, upstreamPort: 3401, tls: isolation, route: updates.route, acceptance: true })
    const executable = await install(shell.installer, output)
    report.install = { source: shell.installer, executable, target: shell.target, version: '1.0.0', optionalFeatures: [] }
    let handle = installedLaunch(executable, output, 'installed')
    await waitFor(() => proxy.read('email-completed'), 'email sign-in through the BFF')
    const hoje = await waitFor(() => proxy.read('hoje'), 'Hoje in installed shell')
    if (hoje.nativeVersion !== '1.0.0') throw new Error('Installed shell has the wrong version')
    report.email = updates.cookieEvidence()
    await inspectSurfaces(proxy, native, handle, output, report)
    await quit(native, handle)
    report.cleanQuit = true
    for (const [mode, phase] of [['bad', 'failed'], ['valid', 'downloaded']]) {
      proxy.reset({})
      updates.mode(mode)
      handle = installedLaunch(executable, output, `update-${mode}`)
      await waitFor(() => proxy.read('hoje'), 'authenticated installed relaunch')
      proxy.send(`update-${phase}`)
      const result = await waitFor(() => proxy.read(`update-${phase}`), `${mode} native updater result`, 200000)
      report[`update-${mode}`] = result.snapshot
      if (mode === 'bad') {
        await quit(native, handle)
        const stderr = await readFile(join(output, 'update-bad.log'), 'utf8')
        if (!/signature/i.test(stderr)) throw new Error('Bad update failed without signature verification evidence')
      }
    }
    // A verified download opens the native restart prompt; installation is a separate acceptance concern.
    report.passed = true
  } catch (error) {
    report.error = error.stack
    throw error
  } finally {
    const cleanups = [() => proxy?.stop(), () => finishRecording?.(), () => stopAll(), () => isolation?.restore(), () => builtWeb ? rm(nextOutput, { recursive: true, force: true }) : undefined]
    const failures = []
    for (const cleanup of cleanups) {
      try { await cleanup() } catch (error) { failures.push(error.stack) }
    }
    if (failures.length) { report.passed = false; report.cleanupErrors = failures }
    await record(join(output, 'report.json'), report)
    if (failures.length) throw new Error(`Acceptance cleanup failed: ${failures.join('\n')}`)
  }
}

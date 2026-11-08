import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'
import { cp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { request as requestHttp } from 'node:http'
import { buildHermeticWeb } from './runner.mjs'
import { readFixtures } from './build.mjs'
import { startProxy } from './server.mjs'
import { assertFree, delay, execute, start, stop, stopAll, waitFor, waitForHttp } from './host.mjs'
import { buildInstaller, desktopOrigin, install, isolateOrigins, startHttpsListener, startRecording } from './acceptance-platform.mjs'
import { NativeTreePendingError, assertAccessibleTree, assertCookieEvidence, assertPaletteFocus, corruptSignature } from './acceptance-contract.mjs'
import { apsEnvironment, exercisePush, pushSender } from './acceptance-push.mjs'

const require = createRequire(import.meta.url)
const directory = dirname(fileURLToPath(import.meta.url))
const windows = process.platform === 'win32'
const record = (path, value) => writeFile(path, `${JSON.stringify(value, null, 2)}\n`)

async function nativeTool(output) {
  const executable = join(output, 'accessibility')
  if (!windows) await execute('clang', ['-fobjc-arc', '-framework', 'AppKit', '-framework', 'ApplicationServices', join(directory, 'acceptance-ax.m'), '-o', executable])
  return async (pid, command, menuCommandId, { title, label, invoke = false, openCenter = false, executable: target } = {}) => {
    const reply = windows
      ? await execute('powershell.exe', ['-NoProfile', '-NonInteractive', '-File', join(directory, 'acceptance-uia.ps1'), '-TargetProcessId', String(pid), '-Command', command,
        ...(menuCommandId === undefined ? [] : ['-MenuCommandId', String(menuCommandId)]),
        ...(title === undefined ? [] : ['-Title', title, '-Label', label]), ...(invoke ? ['-Invoke'] : []), ...(openCenter ? ['-OpenCenter'] : []),
        ...(target === undefined ? [] : ['-Executable', target])])
      : await execute(executable, [String(pid), command, ...(title === undefined ? [] : [title, label, invoke ? '1' : '0', openCenter ? '1' : '0'])])
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
  const webDirectory = join(repository, 'apps/web')
  const standalone = join(webDirectory, '.next/standalone/apps/web')
  await cp(join(webDirectory, 'public'), join(standalone, 'public'), { recursive: true })
  await cp(join(webDirectory, '.next/static'), join(standalone, '.next/static'), { recursive: true })
  const web = start(process.execPath, [join(standalone, 'server.js')], {
    cwd: webDirectory, env: { ...environment, PORT: '3401', HOSTNAME: '127.0.0.1' }, log: join(output, 'web.log'),
  })
  await waitForHttp('http://127.0.0.1:3401/api/health', web)
}

async function prepareUpdateManifest(repository, output, shell) {
  const { artifactName, targets, verifyArtifact, writeManifest } = await import(pathToFileURL(join(repository, 'apps/desktop/scripts/release.ts')).href)
  const name = artifactName('staging', '2.0.0', shell.target)
  if (basename(shell.packagePath) !== name) throw new Error('Acceptance package must use its published artifact name')
  const bytes = await readFile(shell.packagePath)
  verifyArtifact(bytes, shell.signature, shell.publicKey, '2.0.0', name)
  // WHY: The native validator requires every target; acceptance installs only its host package (#1964).
  for (const target of Object.keys(targets)) {
    const path = join(output, artifactName('staging', '2.0.0', target))
    if (path === shell.packagePath) continue
    await cp(shell.packagePath, path)
    await execute(process.execPath, [require.resolve('@tauri-apps/cli/tauri.js'), 'signer', 'sign', '--app-version', '2.0.0', path], {
      env: { ...process.env, TAURI_SIGNING_PRIVATE_KEY_PATH: join(output, 'updater.key'), TAURI_SIGNING_PRIVATE_KEY_PASSWORD: '' }, log: join(output, 'artifact-signing.log'),
    })
  }
  const valid = writeManifest('staging', '2.0.0', output, shell.publicKey)
  const manifest = join(output, 'latest.json')
  await execute(process.execPath, [require.resolve('@tauri-apps/cli/tauri.js'), 'signer', 'sign', '--app-version', '2.0.0', manifest], {
    env: { ...process.env, TAURI_SIGNING_PRIVATE_KEY_PATH: join(output, 'updater.key'), TAURI_SIGNING_PRIVATE_KEY_PASSWORD: '' }, log: join(output, 'manifest-signing.log'),
  })
  const manifestSignature = (await readFile(`${manifest}.sig`, 'utf8')).trim()
  verifyArtifact(await readFile(manifest), manifestSignature, shell.publicKey, '2.0.0', 'latest.json')
  return { valid, bytes, manifestSignature }
}

async function updateServer(repository, output, shell, report) {
  const { valid, bytes, manifestSignature } = await prepareUpdateManifest(repository, output, shell)
  const bad = structuredClone(valid)
  for (const platform of Object.values(bad.platforms)) platform.signature = corruptSignature(platform.signature)
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
    // WebKit initializes remote AX children on demand: https://github.com/WebKit/WebKit/blob/main/Source/WebKit/UIProcess/mac/WebViewImpl.mm
    const captured = await waitFor(async () => {
      let tree
      try {
        tree = await native(handle.child.pid, 'dump')
      } catch (error) {
        await record(join(output, 'trees', `${surface}.json`), { denied: false, error: error.message, nodes: [] })
        throw error
      }
      await record(join(output, 'trees', `${surface}.json`), tree)
      try {
        return { tree, verdict: assertAccessibleTree(tree, process.platform) }
      } catch (error) {
        if (error instanceof NativeTreePendingError) return false
        throw error
      }
    }, `${surface} native web content`, 10000)
    report.accessibility[surface] = captured.verdict
    return captured.tree
  }
  await dump('hoje')
  proxy.send('astra')
  await waitFor(() => proxy.read('astra'), 'Astra surface')
  const astraTree = await dump('astra')
  if (astraTree.denied) proxy.send('astra-close')
  else {
    await native(handle.child.pid, 'escape')
    proxy.send('astra-closed')
  }
  await waitFor(() => proxy.read('astra-closed'), 'Astra dismissal')
  if (astraTree.denied) proxy.send('palette')
  else {
    await native(handle.child.pid, 'palette')
    proxy.send('palette-ready')
  }
  const previous = await waitFor(() => proxy.read('palette'), 'palette surface')
  const tree = await dump('palette')
  if (tree.denied) { report.paletteFocus = { skipped: tree.error }; return }
  await traversePalette(proxy, native, handle, dump, previous, report)
  await native(handle.child.pid, 'escape')
}

async function traversePalette(proxy, native, handle, dump, previous, report) {
  const focus = []
  // A native Down can return without reaching WebKit, so only the probe's keydown receipt proves delivery (#1560).
  // The probe POSTs each receipt from its keydown capture listener, so 5 s bounds one loopback request; three posts add at most 15 s of receipt waiting.
  const paletteKeyWindow = 5000
  const paletteKeyPosts = 3
  const keys = () => proxy.events().filter((event) => event.kind === 'palette-key')
  // WebKit gives a Down that the macOS input method claimed keyCode 229, and cmdk ignores a composing or 229 keydown.
  const downKeys = () => keys().filter((event) => event.key === 'ArrowDown' && event.keyCode !== 229 && !event.composing).length
  report.paletteUndelivered = []
  for (let index = 0; index < 2; index++) {
    const before = proxy.events().filter((event) => event.kind === 'focus').length
    const received = downKeys()
    for (let post = 1; downKeys() === received; post++) {
      if (post > paletteKeyPosts) {
        throw new Error(`Palette received no usable native Down for step ${index + 1} after ${paletteKeyPosts} posts: each Down was missing or claimed by the input method (keyCode 229 or composing)`)
      }
      const keysBefore = keys().length
      await native(handle.child.pid, 'down')
      const deadline = Date.now() + paletteKeyWindow
      await waitFor(() => downKeys() > received || Date.now() >= deadline, 'native Down receipt')
      if (downKeys() === received) report.paletteUndelivered.push({ step: index + 1, post, keys: keys().slice(keysBefore) })
    }
    proxy.send(`focus-${previous.selected + 1}`)
    const current = await waitFor(() => {
      if (downKeys() > received + 1) throw new Error(`Palette step ${index + 1} received ${downKeys() - received} native Down keys`)
      return proxy.events().filter((event) => event.kind === 'focus')[before]
    }, 'palette result focus')
    const selectedTree = await dump(`palette-result-${index + 1}`)
    assertPaletteFocus(previous, current, selectedTree)
    focus.push(current)
    previous = current
  }
  report.paletteFocus = focus
}

function installedLaunch(executable, output, name) {
  const environment = { ...process.env }
  for (const key of ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'http_proxy', 'https_proxy', 'all_proxy']) delete environment[key]
  return start(executable, [], { env: environment, log: join(output, `${name}.log`) })
}

async function quit(native, handle) {
  if (windows) {
    const menu = await native(handle.child.pid, 'menu')
    const labels = await Promise.all(['en', 'pt-BR'].map(async (locale) =>
      JSON.parse(await readFile(join(directory, '../../apps/desktop/locales', `${locale}.json`), 'utf8')).quitWindows))
    const commands = menuCommands(menu.items).filter((item) => labels.includes(item.text.split('\t')[0]))
    if (commands.length !== 1 || !commands[0].enabled || commands[0].id < 1 || commands[0].id > 65535) {
      throw new Error(`Expected one enabled native Exit menu command: ${JSON.stringify(menu)}`)
    }
    await native(handle.child.pid, 'quit', commands[0].id)
  } else await native(handle.child.pid, 'terminate')
  await waitFor(() => handle.child.exitCode !== null, 'clean installed app exit', 30000)
  await handle.done
}

async function mockApi(method, path, body) {
  const response = await fetch(`http://127.0.0.1:5099${path}`, { method,
    ...(body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }) })
  if (!response.ok) throw new Error(`Mock API ${method} ${path} failed: HTTP ${response.status}`)
  return response.status === 204 ? null : response.json()
}

async function catalogValue(path, read) {
  return Promise.all(['en', 'pt-BR'].map(async (locale) => read(JSON.parse(await readFile(join(directory, path, `${locale}.json`), 'utf8')))))
}

async function pushPhase({ proxy, native, updates, handle, executable, output, report, credentials, checkpoint }) {
  // The valid-update launch waits on its restart prompt; stop it and serve no update so the push launch starts clean.
  updates.mode('off')
  await stop(handle)
  checkpoint('push')
  const adopted = new Set()
  const application = windows ? null : dirname(dirname(dirname(executable)))
  let environment = null
  const io = {
    platform: process.platform, report, credentials, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    labels: await catalogValue('../../packages/shared/src/i18n', (catalog) => catalog.profile.settingsRows.alertsOnThisDevice),
    doneLabel: (await catalogValue('../../apps/desktop/locales', (catalog) => catalog.reminderDone))[0],
    // The system authorization alert follows the VM language, which is English on GitHub macOS runners.
    allowLabel: 'Allow', appName: 'Orbit Staging',
    async apsEnvironment() {
      try {
        environment = apsEnvironment(await execute('codesign', ['-d', '--entitlements', '-', '--xml', application]))
      } catch (error) {
        report.pushCodeSignature = error.message.slice(0, 500)
      }
      return environment
    },
    mock: {
      registrations: () => mockApi('GET', '/_test/push-registrations'),
      mintReminder: async (habitId) => (await mockApi('POST', '/_test/repeat-reminders', { habitId })).doneToken,
      logs: () => mockApi('GET', '/_test/habit-logs'),
      sessionMode: (mode) => mockApi('PUT', '/_test/session-mode', { mode }),
    },
    proxy, now: Date.now, delay, waitFor,
    async launch() {
      proxy.reset({ expectAuthenticated: true })
      const shell = installedLaunch(executable, output, 'push')
      await waitFor(() => proxy.read('hoje'), 'authenticated push launch')
      checkpoint('push-hoje')
      return shell
    },
    stop,
    native: (pid, command, options) => native(pid, command, undefined, options),
    async findProcesses() {
      if (windows) return (await native(0, 'process', undefined, { executable })).processIds
      try {
        return (await execute('pgrep', ['-f', executable])).trim().split(/\s+/).filter(Boolean).map(Number)
      } catch (error) {
        report.pushProcessLookup = error.message.slice(0, 500)
        return []
      }
    },
    adopt(pid) { adopted.add(pid) },
    sender: (transport, registration) => pushSender(transport, registration, credentials, environment),
    record: (name, value) => record(join(output, 'trees', `${name}.json`), value),
    warn(message) { process.stdout.write(`::warning title=Desktop push acceptance::${message}\n`) },
  }
  let failure
  try { await exercisePush(io) } catch (error) { failure = error }
  // A notification launch starts the shell outside the process host, so this phase stops it.
  const cleanup = []
  for (const pid of adopted) {
    try {
      process.kill(pid, 0)
    } catch (error) {
      if (error.code !== 'ESRCH') cleanup.push(error.message)
      continue
    }
    try {
      if (windows) await execute('taskkill.exe', ['/PID', String(pid), '/T', '/F'])
      else process.kill(pid, 'SIGKILL')
    } catch (error) {
      cleanup.push(error.message)
    }
  }
  if (cleanup.length) report.pushCleanupErrors = cleanup
  if (failure) throw failure
  if (cleanup.length) throw new Error(`Push acceptance cleanup failed: ${cleanup.join('; ')}`)
}

function menuCommands(items, enabled = true) {
  return items.flatMap((item) => item.children.length
    ? menuCommands(item.children, enabled && item.enabled)
    : [{ ...item, enabled: enabled && item.enabled }])
}

export async function acceptance({ repository, output, credentials = {} }) {
  await mkdir(join(output, 'trees'), { recursive: true })
  const report = { platform: process.platform, architecture: process.arch, accessibility: {}, updateRequests: [], launchChecks: [], passed: false }
  const nextOutput = join(repository, 'apps/web/.next')
  let finishRecording
  let isolation
  let proxy
  let builtWeb = false
  try {
    if (existsSync(nextOutput)) throw new Error('Acceptance requires a fresh hermetic web build')
    const proxyPort = windows ? 443 : 3443
    for (const port of [proxyPort, 5099, 3401]) await assertFree(port)
    if (!windows) await startHttpsListener()
    finishRecording = await startRecording(output)
    const checkpoint = (event) => report.launchChecks.push({ event, recordingSeconds: (Date.now() - finishRecording.startedAt) / 1000 })
    process.stdout.write('Building release-shaped installer and hermetic web application\n')
    const shell = await buildInstaller(repository, output)
    builtWeb = true
    await hermeticServices(repository, output)
    const native = await nativeTool(output)
    const updates = await updateServer(repository, output, shell, report)
    isolation = await isolateOrigins(output)
    proxy = await startProxy({ probePath: join(directory, 'acceptance-probe.js'), port: proxyPort, upstreamPort: 3401, tls: isolation, route: updates.route, acceptance: true })
    const executable = await install(shell.installer, output)
    report.install = { source: shell.installer, executable, target: shell.target, version: '1.0.0', optionalFeatures: [] }
    checkpoint('first-launch')
    let handle = installedLaunch(executable, output, 'installed')
    await waitFor(() => proxy.read('email-completed'), 'email sign-in through the BFF')
    checkpoint('email-completed')
    const hoje = await waitFor(() => proxy.read('hoje'), 'Hoje in installed shell')
    checkpoint('signed-in-hoje')
    if (hoje.nativeVersion !== '1.0.0') throw new Error('Installed shell has the wrong version')
    report.email = updates.cookieEvidence()
    try { await inspectSurfaces(proxy, native, handle, output, report) }
    finally {
      report.paletteInput = proxy.events().filter((event) => ['palette', 'palette-key'].includes(event.kind))
      report.paletteFocus ??= proxy.events().filter((event) => event.kind === 'focus')
    }
    const beforeReload = proxy.events().filter((event) => event.kind === 'hoje').length
    checkpoint('reload')
    proxy.send('reload')
    await waitFor(() => proxy.read('hoje') && proxy.events().filter((event) => event.kind === 'hoje')[beforeReload], 'authenticated reload')
    checkpoint('reloaded-hoje')
    await quit(native, handle)
    report.cleanQuit = true
    for (const [mode, phase] of [['bad', 'failed'], ['valid', 'downloaded']]) {
      proxy.reset({ expectAuthenticated: true })
      updates.mode(mode)
      checkpoint(`relaunch-${mode}`)
      handle = installedLaunch(executable, output, `update-${mode}`)
      await waitFor(() => proxy.read('hoje'), 'authenticated installed relaunch')
      checkpoint(`relaunched-hoje-${mode}`)
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
    await pushPhase({ proxy, native, updates, handle, executable, output, report, credentials, checkpoint })
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
  }
  if (report.cleanupErrors?.length) throw new Error(`Acceptance cleanup failed: ${report.cleanupErrors.join('\n')}`)
}

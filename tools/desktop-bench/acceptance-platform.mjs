import { createRequire } from 'node:module'
import { X509Certificate } from 'node:crypto'
import { artifactName } from '../../apps/desktop/scripts/release.ts'
import { lookup } from 'node:dns/promises'
import { readFile, writeFile, copyFile, readdir, stat, mkdir } from 'node:fs/promises'
import { userInfo } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createInterface } from 'node:readline'
import { delay, execute, start, stop, track, waitFor } from './host.mjs'
import { npmCli } from './build.mjs'
import { startLoopbackDns } from './loopback-dns.mjs'

const require = createRequire(import.meta.url)
const windows = process.platform === 'win32'
export const desktopOrigin = 'https://app-staging.useorbit.org'

export async function startHttpsListener() {
  const moduleUrl = new URL('./https-forwarder.mjs', import.meta.url).href
  const source = `const { forwardHttps } = await import(${JSON.stringify(moduleUrl)}); await forwardHttps(Number(process.argv[1]), Number(process.argv[2]))`
  const handle = start('sudo', ['-n', process.execPath, '--input-type=module', '-e', source, String(process.getuid()), String(process.getgid())],
    { stdio: ['pipe', 'pipe', 'pipe'] })
  handle.nativeRequest = async () => { handle.child.stdin.end() }
  const lines = createInterface({ input: handle.child.stdout })
  try {
    const ready = await Promise.race([
      new Promise((resolve) => lines.once('line', resolve)),
      handle.done.then(() => { throw new Error('HTTPS listener exited before readiness') }),
    ])
    if (ready !== 'listening') throw new Error(`Unexpected HTTPS listener reply: ${ready}`)
    return handle
  } catch (error) {
    await stop(handle)
    throw error
  } finally {
    lines.close()
  }
}

export async function buildInstaller(repository, output, signing = null) {
  const desktop = join(repository, 'apps/desktop')
  const cli = require.resolve('@tauri-apps/cli/tauri.js')
  const key = join(output, 'updater.key')
  await execute(process.execPath, [cli, 'signer', 'generate', '--ci', '--write-keys', key], { cwd: desktop, log: join(output, 'key-generation.log') })
  const publicKey = (await readFile(`${key}.pub`, 'utf8')).trim()
  const environment = { ...process.env, TAURI_SIGNING_PUBLIC_KEY: publicKey }
  const overlay = join(output, 'release-config.json')
  await execute(process.execPath, ['--experimental-strip-types', 'scripts/release.ts', 'prepare', 'staging', '1.0.0', overlay], { cwd: desktop, env: environment })
  const target = windows ? 'x86_64-pc-windows-msvc' : process.arch === 'arm64' ? 'aarch64-apple-darwin' : 'x86_64-apple-darwin'
  const tauri = (script, argumentsList, options) => execute(process.execPath, [npmCli(), 'run', script, '-w', '@orbit/desktop', '--', '--config', overlay,
    '--target', target, ...argumentsList], { cwd: repository, ...options })
  if (windows || !signing) {
    await tauri('build:staging', ['--no-sign', '--ci', '--bundles', windows ? 'nsis' : 'app,dmg', '--', '--locked'], { log: join(output, 'shell-build.log') })
  } else {
    // As desktop-release.yml does, the compile sees no signing credentials and only the bundle step signs.
    await tauri('build:staging', ['--no-bundle', '--ci', '--', '--locked'], { log: join(output, 'shell-build.log') })
    const signingConfig = await prepareMacSigning(desktop, output, signing.profile)
    // The bundle step also signs the updater archive, so it receives the key this run generated, never the staging updater key.
    await tauri('bundle:staging', ['--config', signingConfig, '--bundles', 'app,dmg', '--ci'], { log: join(output, 'shell-signing.log'), env: {
      ...process.env, APPLE_CERTIFICATE: signing.certificate, APPLE_CERTIFICATE_PASSWORD: signing.password, APPLE_SIGNING_IDENTITY: signing.identity,
      TAURI_SIGNING_PRIVATE_KEY: key, TAURI_SIGNING_PRIVATE_KEY_PASSWORD: '',
    } })
  }
  const bundle = join(desktop, 'src-tauri/target', target, 'release/bundle')
  const installerDirectory = join(bundle, windows ? 'nsis' : 'dmg')
  const installers = (await readdir(installerDirectory)).filter((name) => name.endsWith(windows ? '.exe' : '.dmg'))
  if (installers.length !== 1) throw new Error('Expected exactly one release installer')
  const installer = join(installerDirectory, installers[0])
  const packages = windows ? [installer] : (await readdir(join(bundle, 'macos'))).filter((name) => name.endsWith('.app.tar.gz')).map((name) => join(bundle, 'macos', name))
  if (packages.length !== 1) throw new Error('Expected exactly one updater package')
  const packagePath = join(output, artifactName('staging', '2.0.0', target))
  await copyFile(packages[0], packagePath)
  await execute(process.execPath, [cli, 'signer', 'sign', '--app-version', '2.0.0', packagePath], {
    cwd: desktop, env: { ...process.env, TAURI_SIGNING_PRIVATE_KEY_PATH: key, TAURI_SIGNING_PRIVATE_KEY_PASSWORD: '' }, log: join(output, 'package-signing.log'),
  })
  return { installer, packagePath, signature: (await readFile(`${packagePath}.sig`, 'utf8')).trim(), target, publicKey }
}

async function prepareMacSigning(desktop, output, profile) {
  const directory = join(output, 'macos-signing')
  await mkdir(directory, { recursive: true, mode: 0o700 })
  const profilePath = join(directory, 'embedded.provisionprofile')
  await writeFile(profilePath, Buffer.from(profile, 'base64'), { mode: 0o600 })
  const decoded = join(directory, 'profile.plist')
  await writeFile(decoded, await execute('security', ['cms', '-D', '-i', profilePath]))
  const read = async (plist, key) => (await execute('/usr/libexec/PlistBuddy', ['-c', `Print :${key}`, plist])).trim()
  const expected = await read(join(desktop, 'src-tauri/native/macos/Entitlements.staging.plist'), 'com.apple.application-identifier')
  const named = await read(decoded, 'Entitlements:com.apple.application-identifier')
  if (named !== expected) throw new Error(`The provisioning profile names ${named}, not ${expected} from Entitlements.staging.plist`)
  const signingConfig = join(directory, 'signing-config.json')
  await writeFile(signingConfig, JSON.stringify({ bundle: { macOS: { files: { 'embedded.provisionprofile': profilePath } } } }))
  return signingConfig
}

export async function install(installer, output) {
  if (windows) {
    const destination = join(output, 'installed')
    if (/\s/.test(destination)) throw new Error('The NSIS acceptance destination must not need command-line quoting')
    await execute(installer, ['/S', `/D=${destination}`], { log: join(output, 'install.log') })
    const executable = join(destination, 'orbit-desktop.exe')
    await stat(executable)
    return executable
  }
  const mount = join(output, 'mounted')
  await mkdir(mount)
  await execute('hdiutil', ['attach', installer, '-nobrowse', '-mountpoint', mount], { log: join(output, 'install.log') })
  try {
    await execute('sudo', ['ditto', join(mount, 'Orbit Staging.app'), '/Applications/Orbit Staging.app'], { log: join(output, 'install.log') })
  } finally {
    await execute('hdiutil', ['detach', mount], { log: join(output, 'install.log') })
  }
  return '/Applications/Orbit Staging.app/Contents/MacOS/orbit-desktop'
}

const lsregister = '/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister'

// usernoted starts the app for a notification response at the copy that LaunchServices finds for the bundle identifier, and
// NSWorkspace.h says that lookup "uses various heuristics in case multiple apps have the same bundle ID". The build output
// registers a second copy, and in run 42704572115 the expired-session Done started it, which the installed-path lookup never
// finds. Thus every copy in a harness directory leaves LaunchServices and the disk, and the installed copy must then rank first.
// lsregister -u exits 1 for a path that no longer exists, such as a detached disk image, so only present copies are unregistered.
export async function keepInstalledLaunchCopy(application, harnessDirectories, host) {
  const identifier = (await host.execute('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleIdentifier', join(application, 'Contents/Info.plist')])).trim()
  const others = (await host.bundles(identifier)).copies.filter((path) => path !== application)
  const foreign = others.filter((path) => !harnessDirectories.some((directory) => path.startsWith(`${directory}/`)))
  if (foreign.length) throw new Error(`LaunchServices lists ${identifier} at ${foreign.join(', ')}, outside the installed app and the harness directories`)
  const removed = []
  for (const path of others) {
    if (!await host.exists(path)) continue
    await host.execute(lsregister, ['-u', path])
    await host.remove(path)
    removed.push(path)
  }
  const { best } = await host.bundles(identifier)
  if (best !== application) throw new Error(`LaunchServices still ranks ${best} first for ${identifier}, not ${application}`)
  return { identifier, removed, best }
}

// The desktop-staging environment supplies these to a same-repository macOS job; a fork pull request receives none.
const signingNames = ['MACOS_DEVELOPER_ID_CERTIFICATE_BASE64', 'MACOS_DEVELOPER_ID_CERTIFICATE_PASSWORD', 'MACOS_PROVISIONING_PROFILE_BASE64', 'MACOS_SIGNING_IDENTITY']

export function takeSigningMaterial(environment, platform = process.platform) {
  const values = Object.fromEntries(signingNames.map((name) => [name, environment[name]]))
  for (const name of signingNames) delete environment[name]
  if (platform !== 'darwin') return null
  const missing = signingNames.filter((name) => !values[name])
  if (missing.length === signingNames.length) return null
  if (missing.length) throw new Error(`Developer ID signing needs ${missing.join(', ')}; the job has only part of the desktop-staging signing material`)
  return { certificate: values.MACOS_DEVELOPER_ID_CERTIFICATE_BASE64, password: values.MACOS_DEVELOPER_ID_CERTIFICATE_PASSWORD,
    profile: values.MACOS_PROVISIONING_PROFILE_BASE64, identity: values.MACOS_SIGNING_IDENTITY }
}

// The High modes compile the native types from windows-unelevated.cs beside the script, so both files reach the output.
async function copyLauncher(output, host) {
  for (const file of ['windows-unelevated.ps1', 'windows-unelevated.cs']) {
    await host.copyFile(fileURLToPath(new URL(`./${file}`, import.meta.url)), join(output, file))
  }
  return join(output, 'windows-unelevated.ps1')
}

export function launchStatus(text) {
  const entries = text.split(/\r?\n/).filter((line) => line.trim()).map((line) => JSON.parse(line))
  const error = entries.find((entry) => entry.kind === 'error')
  if (error) throw new Error(`Medium-integrity launch failed: ${error.message}`)
  const launch = entries.find((entry) => entry.kind === 'launch')
  return { context: entries.find((entry) => entry.kind === 'context')?.context, pid: launch?.pid, shell: launch?.shell, shellError: launch?.shellError,
    exit: entries.find((entry) => entry.kind === 'exit') }
}

// SECURITY_MANDATORY_HIGH_RID: Security::IntegrityLevel::IsIntegrityLevelElevated in the Windows App SDK refuses this level and above.
const highIntegrity = 0x3000

// Launch context of a person's app: the shell's own token, never the elevated harness that edits hosts and the root store.
export function launchContext(handle) {
  if (windows) return handle.context
  return { user: userInfo().username, elevated: process.getuid() === 0 }
}

export async function launchUnelevated(executable, output, name, host = { execute, waitFor, delay, readFile, copyFile, alive: processAlive, now: Date.now, track, stop }) {
  const script = await copyLauncher(output, host)
  const status = join(output, `${name}-launch.jsonl`)
  const log = join(output, `${name}.log`)
  const started = JSON.parse(await host.execute('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script,
    '-Mode', 'start', '-Executable', executable, '-Log', log, '-Output', join(output, `${name}.stdout.log`), '-Status', status]))
  const read = async () => {
    try { return launchStatus(await host.readFile(status, 'utf8')) } catch (error) { if (error.code === 'ENOENT') return {}; throw error }
  }
  let launched
  try {
    launched = await host.waitFor(async () => { const value = await read(); return value.pid && value }, `the Medium-integrity ${name} launch`, 60000)
  } catch (error) {
    const running = host.alive(started.launcher)
    if (running) await host.execute('taskkill.exe', ['/PID', String(started.launcher), '/T', '/F'])
    throw new Error(`${error.message}; launcher ${started.launcher} ${running ? 'was still running and is stopped' : 'had exited'}; see ${status}`)
  }
  const child = { pid: launched.pid, exitCode: null }
  const done = (async () => {
    let vanishedAt = null
    while (true) {
      const value = await read()
      if (value.exit) { child.exitCode = value.exit.code; break }
      // A launcher that dies without its exit line leaves a vanished pid, which ends the wait after 10 s.
      if (host.alive(child.pid)) vanishedAt = null
      else if (vanishedAt === null) vanishedAt = host.now()
      else if (host.now() - vanishedAt > 10000) { child.exitCode = -1; break }
      await host.delay(250)
    }
    if (child.exitCode !== 0) throw new Error(`${executable} exited ${child.exitCode === -1 ? 'without a recorded exit code' : child.exitCode}; see ${log}`)
  })()
  done.catch(() => {})
  // The shell inherits the launcher's token, so the launcher's context judges a shell that exited before its token was read.
  const shell = launched.shell ?? launched.context
  const handle = { child, done, log, context: { ...shell, source: launched.shell ? 'shell' : 'launcher', launcher: launched.context,
    ...(launched.shellError ? { shellError: launched.shellError } : {}), harness: started.harness, outputLabel: started.outputLabel } }
  host.track(handle)
  if (!Number.isInteger(shell?.integrityRid) || shell.integrityRid >= highIntegrity) {
    await host.stop(handle)
    const account = shell ? `${shell.user} (user RID ${shell.rid}, TokenIsElevated ${shell.tokenIsElevated})` : 'an unknown user'
    throw new Error(`The ${name} shell started at ${shell?.integrity ?? 'an unknown'} integrity as ${account}; app notifications need Medium integrity or below`)
  }
  return handle
}

export function activationStatus(text) {
  const entries = text.split(/\r?\n/).filter((line) => line.trim()).map((line) => JSON.parse(line))
  const failure = entries.find((entry) => entry.kind === 'error')
  const activated = entries.find((entry) => entry.kind === 'activated')
  return { context: entries.find((entry) => entry.kind === 'context')?.context, ...(activated ? { hresult: activated.hresult } : {}),
    ...(failure ? { error: failure.message } : {}) }
}

// A cold start waits for COM to start the shell from its LocalServer32 command and for the shell to register its activator.
const activationTimeout = 150000

// Drives a toast click from a Medium client with the shell's standard-user token. The High activate mode reads the shell's
// activator registration and the Done arguments of the posted toast, then the client calls Activate (windows-unelevated.ps1).
export async function activateUnelevated({ executable, output, name, title, label },
  host = { execute, waitFor, readFile, copyFile, alive: processAlive }) {
  const script = await copyLauncher(output, host)
  const status = join(output, `${name}.jsonl`)
  const started = JSON.parse(await host.execute('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script,
    '-Mode', 'activate', '-Executable', executable, '-Title', title, '-Label', label, '-Status', status, '-Request', join(output, `${name}-request.json`)]))
  const read = async () => {
    try { return activationStatus(await host.readFile(status, 'utf8')) } catch (error) { if (error.code === 'ENOENT') return {}; throw error }
  }
  let finished
  try {
    finished = await host.waitFor(async () => { const value = await read(); return (value.hresult !== undefined || value.error) && value },
      `the Medium-integrity ${name} client`, activationTimeout)
  } catch (error) {
    const running = host.alive(started.client)
    if (running) await host.execute('taskkill.exe', ['/PID', String(started.client), '/T', '/F'])
    throw new Error(`${error.message}; client ${started.client} ${running ? 'was still running and is stopped' : 'had exited'}; see ${status}`)
  }
  return { ...started, context: finished.context, ...(finished.hresult !== undefined ? { hresult: finished.hresult } : {}),
    ...(finished.error ? { error: finished.error } : {}) }
}

const apsctl = '/System/Library/PrivateFrameworks/ApplePushService.framework/apsctl'
// The image keychain gives every runner one apsd identity: the courier rolls that token and apsd drops the reminder as "a
// completely unknown token". Without a keychain apsd creates one ("created keychain") and gets a new public token.
const apsdKeychain = '/Library/Keychains/apsd.keychain'
// The macos-latest image leaves com.apple.apsd and com.apple.notificationcenterui.agent unloaded: `launchctl print` finds
// neither service, apsctl answers "Connection invalid" and usernoted cannot reach Notification Center. Then no
// authorization alert shows and no APNs token arrives. Hosted probes loaded both through launchd, as a login does, and a
// Developer ID signed app then got its authorization answer and an 80-byte APNs token. An `open -b` start of Notification
// Center showed no alert, because launchd vends no service for it.
const pushServices = [
  { domain: 'system', label: 'com.apple.apsd', plist: '/System/Library/LaunchDaemons/com.apple.apsd.plist', freshKeychain: apsdKeychain },
  { domain: 'gui', label: 'com.apple.notificationcenterui.agent', plist: '/System/Library/LaunchAgents/com.apple.notificationcenterui.plist' },
]
const apsdStatusLine = /^\s*(daemon status|connection environment|connection status|server hostname):.*$/gm

export async function startPushServices(host = { execute, waitFor }, uid = process.getuid()) {
  for (const { domain, label, plist, freshKeychain } of pushServices) {
    const target = domain === 'gui' ? `gui/${uid}` : domain
    const service = `${target}/${label}`
    // The system domain needs root; the gui domain belongs to the signed-in runner user.
    const launchctl = (...argumentsList) => domain === 'system'
      ? host.execute('sudo', ['launchctl', ...argumentsList]) : host.execute('launchctl', argumentsList)
    await host.execute('sudo', ['launchctl', 'enable', service])
    let loaded = await launchctl('print', service).then(() => true, () => false)
    if (freshKeychain) {
      // A running apsd holds its identity in memory, so it stops before its keychain goes.
      if (loaded) await launchctl('bootout', service)
      await host.execute('sudo', ['rm', '-f', freshKeychain])
      loaded = false
    }
    if (!loaded) await launchctl('bootstrap', target, plist)
    await launchctl('kickstart', service)
  }
  let last = ''
  let status
  try {
    status = await host.waitFor(async () => {
      last = await host.execute(apsctl, ['status']).catch((error) => error.message)
      return /daemon status:\s+Running/.test(last) && /connection status:\s+Yes/.test(last) && last
    }, 'apsd to connect to the APNs courier', 60000)
  } catch (error) {
    if (!error.message.startsWith('Timed out')) throw error
    throw new Error(`${error.message}; last apsctl status: ${apsdSummary(last).join('; ')}`)
  }
  await host.waitFor(() => host.execute('pgrep', ['-x', 'NotificationCenter']).then((processIds) => processIds.trim(), () => ''), 'Notification Center', 30000)
  return { apsd: apsdSummary(status) }
}

const collapse = (line) => line.trim().replace(/\s{2,}/g, ' ')

// The matched status lines, or a bounded prefix of a reply that has none of them, such as "Connection invalid".
export function apsdSummary(text) {
  const lines = (text.match(apsdStatusLine) ?? []).map(collapse)
  return lines.length ? lines : [collapse(text).slice(0, 300)]
}

const indent = (line) => line.length - line.trimStart().length

// apsctl prints one block per registered process, indented under its connection environment, with its topics, the incoming
// pushes per topic and the pushes apsd handed to the process. A named port opens the block with "application port name";
// usernoted, which receives every app's alert pushes, has no port name, so its block opens with "process" (apsctl status on
// macos-latest).
export function apsdApplication(text, topic) {
  const lines = text.split(/\r?\n/)
  for (let start = 0; start < lines.length; start++) {
    if (!/^\s*(application port name|process):/.test(lines[start])) continue
    let end = start + 1
    while (end < lines.length && (!lines[end].trim() || indent(lines[end]) > indent(lines[start]))) end++
    const block = lines.slice(start, end).filter((line) => line.trim()).map(collapse)
    if (block.some((line) => line === `topic: ${topic}`)) return block.slice(0, 80)
  }
  return null
}

// Each topic line carries its incoming push count and the time of the last one on deeper lines. A topic apsd lists for more
// than one process counts once per listing.
export function apsdTopicReceipt(text, topic) {
  const lines = text.split(/\r?\n/)
  let count = 0
  let last = null
  for (let start = 0; start < lines.length; start++) {
    if (lines[start].trim().replace(/\s+/g, ' ') !== `topic: ${topic}`) continue
    for (let line = start + 1; line < lines.length && indent(lines[line]) > indent(lines[start]); line++) {
      const incoming = /^\s*incoming push notifications:\s+(\d+)\s*$/.exec(lines[line])
      if (incoming) count += Number(incoming[1])
      const received = /^\s*last incoming push:\s+(.+?)\s*$/.exec(lines[line])
      if (received) last = received[1]
    }
  }
  return { count, last }
}

export async function apsdReceipt(topic, host = { execute }) {
  return apsdTopicReceipt(await host.execute(apsctl, ['status']), topic)
}

const notificationLogPredicate = ['apsd', 'usernoted', 'NotificationCenter', 'orbit-desktop'].map((name) => `process == "${name}"`)
  .concat('subsystem == "com.apple.UserNotifications"').join(' OR ')

function logStart(date) {
  const pad = (value) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

// Device tokens stay out of the artifacts, as the registration record keeps only the token length.
const redactTokens = (text) => text.replace(/bytes=<[0-9a-f ]+>/gi, 'bytes=<redacted>')

// The push phase keeps what apsd and usernoted did with the reminder: the app's apsd block shows whether the push reached the
// device and the process, and the unified log shows each presentation decision.
export async function capturePushDiagnostics(output, { topic, since }, host = { execute, writeFile }) {
  const status = redactTokens(await host.execute(apsctl, ['status']).catch((error) => error.message))
  await host.writeFile(join(output, 'push-apsctl-status.log'), status)
  const unifiedLog = join(output, 'push-unified.log')
  let unifiedError = null
  try {
    await host.execute('/usr/bin/log', ['show', '--start', logStart(since), '--style', 'compact', '--info', '--debug', '--predicate', notificationLogPredicate],
      { log: unifiedLog })
  } catch (error) { unifiedError = error.message.slice(0, 500) }
  return { apsdStatus: 'push-apsctl-status.log', apsdApplication: topic ? apsdApplication(status, topic) : null, unifiedLog: 'push-unified.log',
    ...(unifiedError ? { unifiedError } : {}) }
}

function processAlive(pid) {
  try { process.kill(pid, 0); return true } catch (error) { if (error.code === 'ESRCH') return false; throw error }
}

export async function startRecording(output) {
  const log = join(output, 'capture.log')
  await writeFile(log, '')
  let input = ['-f', 'gdigrab', '-framerate', '2', '-i', 'desktop']
  if (!windows) {
    const devicesLog = join(output, 'capture-devices.log')
    const devices = start('ffmpeg', ['-hide_banner', '-f', 'avfoundation', '-list_devices', 'true', '-i', ''], { log: devicesLog })
    await devices.done.catch(() => {})
    const listing = await readFile(devicesLog, 'utf8')
    const screen = /\[(\d+)\] Capture screen \d+/.exec(listing)
    if (!screen) throw new Error(`No AVFoundation screen device; see ${devicesLog}`)
    input = ['-f', 'avfoundation', '-framerate', '2', '-i', `${screen[1]}:none`]
  }
  const video = join(output, 'screen.mp4')
  const startedAt = Date.now()
  const recording = start('ffmpeg', ['-hide_banner', '-y', ...input, '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2',
    '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '28', '-pix_fmt', 'yuv420p', video], { log, stdio: ['pipe', 'pipe', 'pipe'] })
  await waitFor(async () => {
    if (recording.child.exitCode !== null) throw new Error(`Screen capture exited; see ${log}`)
    return (await readFile(log, 'utf8')).includes('Output #0')
  }, 'screen capture output', 30000)
  const finish = async () => {
    recording.child.stdin.end('q\n')
    await recording.done
    if ((await stat(video)).size < 10000) throw new Error('Screen recording is empty')
    await execute('ffmpeg', ['-hide_banner', '-v', 'error', '-xerror', '-i', video, '-f', 'null', '-'], { log: join(output, 'capture-decode.log') })
  }
  finish.startedAt = startedAt
  return finish
}

export async function isolateOrigins(output) {
  const hosts = windows ? join(process.env.SystemRoot, 'System32/drivers/etc/hosts') : null
  const originalHosts = windows ? await readFile(hosts, 'utf8') : null
  const replacement = join(output, 'isolated-hosts')
  if (windows) await writeFile(replacement, `${originalHosts}\n127.0.0.1 app-staging.useorbit.org github.com\n::1 app-staging.useorbit.org github.com\n`)
  const resolver = windows ? null : macResolverIsolation(output)
  const openssl = async (...argumentsList) => execute('openssl', argumentsList, { cwd: output, log: join(output, 'tls.log') })
  await openssl('req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', 'root.key', '-out', 'root.pem', '-days', '1', '-subj', '/CN=Orbit Desktop VM Root')
  await openssl('req', '-newkey', 'rsa:2048', '-nodes', '-keyout', 'server.key', '-out', 'server.csr', '-subj', '/CN=app-staging.useorbit.org')
  await writeFile(join(output, 'server.ext'), 'subjectAltName=DNS:app-staging.useorbit.org,DNS:github.com\nbasicConstraints=CA:FALSE\nkeyUsage=digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\n')
  await openssl('x509', '-req', '-in', 'server.csr', '-CA', 'root.pem', '-CAkey', 'root.key', '-CAcreateserial', '-out', 'server.pem', '-days', '1', '-extfile', 'server.ext')
  const root = join(output, 'root.pem')
  const fingerprint = new X509Certificate(await readFile(root)).fingerprint.replaceAll(':', '')
  let trusted = false
  const refreshResolver = async () => {
    if (windows) await execute('ipconfig.exe', ['/flushdns'])
  }
  const restore = async () => {
    const failures = []
    try {
      if (windows) {
        const backup = join(output, 'original-hosts')
        await writeFile(backup, originalHosts)
        await copyFile(backup, hosts)
        await refreshResolver()
      } else await resolver.restore()
    } catch (error) { failures.push(error) }
    try {
      if (trusted) {
        if (windows) await execute('certutil.exe', ['-delstore', 'Root', fingerprint])
        else await execute('sudo', ['security', 'delete-certificate', '-Z', fingerprint, '/Library/Keychains/System.keychain'])
      }
    } catch (error) { failures.push(error) }
    if (failures.length) throw new AggregateError(failures, 'Origin isolation cleanup failed')
  }
  try {
    if (windows) {
      await execute('certutil.exe', ['-addstore', '-f', 'Root', root])
      trusted = true
      await copyFile(replacement, hosts)
    } else {
      await execute('sudo', ['security', 'add-trusted-cert', '-d', '-r', 'trustRoot', '-k', '/Library/Keychains/System.keychain', root])
      trusted = true
      await resolver.install()
    }
    await waitForIsolatedOrigins(refreshResolver)
    return { key: await readFile(join(output, 'server.key')), cert: await readFile(join(output, 'server.pem')), restore }
  } catch (error) {
    const failures = [error]
    try { if (!windows) await recordResolverDiagnostics(output, error) } catch (diagnosticError) { failures.push(diagnosticError) }
    try { await resolver?.record() } catch (diagnosticError) { failures.push(diagnosticError) }
    try { await restore() } catch (restoreError) { failures.push(restoreError) }
    if (failures.length > 1) throw new AggregateError(failures, error.message)
    throw error
  }
}

export async function waitForIsolatedOrigins(refreshResolver, resolve = lookup) {
  await refreshResolver()
  const deadline = Date.now() + 30000
  while (true) {
    const resolutions = await Promise.all(['app-staging.useorbit.org', 'github.com'].map(async (hostname) =>
      ({ hostname, addresses: await resolve(hostname, { all: true }) })))
    const failures = resolutions.filter(({ addresses }) => !addresses.length ||
      addresses.some(({ address }) => !['127.0.0.1', '::1'].includes(address)))
    if (!failures.length) return
    const remaining = deadline - Date.now()
    if (remaining <= 0) {
      throw new Error(`Origin isolation failed for ${failures.map(({ hostname, addresses }) => `${hostname}: ${JSON.stringify(addresses)}`).join('; ')}`)
    }
    await delay(Math.min(250, remaining))
  }
}

async function recordResolverDiagnostics(output, failure) {
  const commands = [
    ['resolvers', 'ls', ['-le@', '/etc/resolver']],
    ['app-resolver', 'cat', ['/etc/resolver/app-staging.useorbit.org']],
    ['github-resolver', 'cat', ['/etc/resolver/github.com']],
    ['dns', 'scutil', ['--dns']],
    ['host-query', 'dscacheutil', ['-q', 'host', '-a', 'name', 'app-staging.useorbit.org']],
    ['mdns', '/usr/bin/log', ['show', '--last', '2m', '--predicate', 'process == "mDNSResponder"']],
  ].map(([name, command, argumentsList]) => ({ command, argumentsList, log: join(output, `origin-isolation-${name}.log`) }))
  const results = await Promise.allSettled(commands.map(({ command, argumentsList, log }) => execute(command, argumentsList, { log })))
  const captures = commands.map((command, index) => ({ ...command,
    error: results[index].status === 'rejected' ? results[index].reason.message : null }))
  await writeFile(join(output, 'origin-isolation-diagnostics.log'), `${JSON.stringify({ error: failure.message, commands: captures }, null, 2)}\n`)
}

function macResolverIsolation(output) {
  const originals = []
  let responder
  let createdDirectory = false
  const exists = async (path) => {
    try { await stat(path); return true } catch (error) { if (error.code === 'ENOENT') return false; throw error }
  }
  return { async install() {
    responder = await startLoopbackDns(output)
    if (!await exists('/etc/resolver')) {
      await execute('sudo', ['mkdir', '/etc/resolver'])
      createdDirectory = true
    }
    for (const hostname of ['app-staging.useorbit.org', 'github.com']) {
      const path = `/etc/resolver/${hostname}`
      const backup = await exists(path) ? join(output, `original-resolver-${hostname}`) : null
      if (backup) await execute('sudo', ['cp', '-p', path, backup])
      const configuration = join(output, `resolver-${hostname}`)
      await writeFile(configuration, `nameserver 127.0.0.1\nport ${responder.port}\n`)
      originals.push({ path, backup })
      await execute('sudo', ['cp', configuration, path])
    }
  }, async record() { await responder?.record() }, async restore() {
    const failures = []
    for (const { path, backup } of originals.toReversed()) {
      try {
        if (backup) await execute('sudo', ['cp', '-p', backup, path])
        else await execute('sudo', ['rm', '-f', path])
      } catch (error) { failures.push(error) }
    }
    try { if (createdDirectory) await execute('sudo', ['rmdir', '/etc/resolver']) } catch (error) { failures.push(error) }
    try { await responder?.stop() } catch (error) { failures.push(error) }
    if (failures.length) throw new AggregateError(failures, 'Per-domain resolver cleanup failed')
  } }
}

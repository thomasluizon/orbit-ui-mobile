import { createRequire } from 'node:module'
import { X509Certificate } from 'node:crypto'
import { lookup } from 'node:dns/promises'
import { readFile, writeFile, copyFile, readdir, stat, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { delay, execute, start, stop, waitFor } from './host.mjs'
import { npmCli } from './build.mjs'

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

export async function buildInstaller(repository, output) {
  const desktop = join(repository, 'apps/desktop')
  const cli = require.resolve('@tauri-apps/cli/tauri.js')
  const key = join(output, 'updater.key')
  await execute(process.execPath, [cli, 'signer', 'generate', '--ci', '--write-keys', key], { cwd: desktop, log: join(output, 'key-generation.log') })
  const publicKey = (await readFile(`${key}.pub`, 'utf8')).trim()
  const environment = { ...process.env, TAURI_SIGNING_PUBLIC_KEY: publicKey }
  const overlay = join(output, 'release-config.json')
  await execute(process.execPath, ['--experimental-strip-types', 'scripts/release.ts', 'prepare', 'staging', '1.0.0', overlay], { cwd: desktop, env: environment })
  const target = windows ? 'x86_64-pc-windows-msvc' : process.arch === 'arm64' ? 'aarch64-apple-darwin' : 'x86_64-apple-darwin'
  await execute(process.execPath, [npmCli(), 'run', 'build:staging', '-w', '@orbit/desktop', '--', '--config', overlay,
    '--target', target, '--no-sign', '--ci', '--bundles', windows ? 'nsis' : 'app,dmg', '--', '--locked'], { cwd: repository, log: join(output, 'shell-build.log') })
  const bundle = join(desktop, 'src-tauri/target', target, 'release/bundle')
  const installerDirectory = join(bundle, windows ? 'nsis' : 'dmg')
  const installers = (await readdir(installerDirectory)).filter((name) => name.endsWith(windows ? '.exe' : '.dmg'))
  if (installers.length !== 1) throw new Error('Expected exactly one release installer')
  const installer = join(installerDirectory, installers[0])
  const packages = windows ? [installer] : (await readdir(join(bundle, 'macos'))).filter((name) => name.endsWith('.app.tar.gz')).map((name) => join(bundle, 'macos', name))
  if (packages.length !== 1) throw new Error('Expected exactly one updater package')
  const packagePath = join(output, windows ? 'update.exe' : 'update.app.tar.gz')
  await copyFile(packages[0], packagePath)
  await execute(process.execPath, [cli, 'signer', 'sign', '--app-version', '2.0.0', packagePath], {
    cwd: desktop, env: { ...process.env, TAURI_SIGNING_PRIVATE_KEY_PATH: key, TAURI_SIGNING_PRIVATE_KEY_PASSWORD: '' }, log: join(output, 'package-signing.log'),
  })
  return { installer, packagePath, signature: (await readFile(`${packagePath}.sig`, 'utf8')).trim(), target, publicKey }
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
  const recording = start('ffmpeg', ['-hide_banner', '-y', ...input, '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2',
    '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '28', '-pix_fmt', 'yuv420p', video], { log, stdio: ['pipe', 'pipe', 'pipe'] })
  await waitFor(async () => {
    if (recording.child.exitCode !== null) throw new Error(`Screen capture exited; see ${log}`)
    return (await readFile(log, 'utf8')).includes('Output #0')
  }, 'screen capture output', 30000)
  return async () => {
    recording.child.stdin.end('q\n')
    await recording.done
    if ((await stat(video)).size < 10000) throw new Error('Screen recording is empty')
    await execute('ffmpeg', ['-hide_banner', '-v', 'error', '-xerror', '-i', video, '-f', 'null', '-'], { log: join(output, 'capture-decode.log') })
  }
}

export async function isolateOrigins(output) {
  const hosts = windows ? join(process.env.SystemRoot, 'System32/drivers/etc/hosts') : '/etc/hosts'
  const originalHosts = await readFile(hosts, 'utf8')
  const replacement = join(output, 'isolated-hosts')
  await writeFile(replacement, `${originalHosts}\n127.0.0.1 app-staging.useorbit.org github.com\n::1 app-staging.useorbit.org github.com\n`)
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
    else {
      await execute('sudo', ['dscacheutil', '-flushcache'])
      await execute('sudo', ['killall', '-HUP', 'mDNSResponder'])
    }
  }
  const restore = async () => {
    const backup = join(output, 'original-hosts')
    await writeFile(backup, originalHosts)
    if (windows) await copyFile(backup, hosts)
    else await execute('sudo', ['cp', backup, hosts])
    await refreshResolver()
    if (trusted) {
      if (windows) await execute('certutil.exe', ['-delstore', 'Root', fingerprint])
      else await execute('sudo', ['security', 'delete-certificate', '-Z', fingerprint, '/Library/Keychains/System.keychain'])
    }
  }
  try {
    if (windows) {
      await execute('certutil.exe', ['-addstore', '-f', 'Root', root])
      trusted = true
      await copyFile(replacement, hosts)
    } else {
      await execute('sudo', ['security', 'add-trusted-cert', '-d', '-r', 'trustRoot', '-k', '/Library/Keychains/System.keychain', root])
      trusted = true
      await execute('sudo', ['cp', replacement, hosts])
    }
    await waitForIsolatedOrigins(refreshResolver)
    return { key: await readFile(join(output, 'server.key')), cert: await readFile(join(output, 'server.pem')), restore }
  } catch (error) {
    try {
      if (!windows) await recordResolverDiagnostics(output, error)
    } catch (diagnosticError) {
      throw new AggregateError([error, diagnosticError], error.message)
    } finally {
      await restore()
    }
    throw error
  }
}

export async function waitForIsolatedOrigins(refreshResolver, resolve = lookup) {
  await refreshResolver()
  // Hosts reload asynchronously; repeated cache purges restart queries while the VM settles (#1560).
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
    ['hosts', 'tail', ['-n', '40', '/etc/hosts']],
    ['hosts-metadata', 'ls', ['-le@', '/etc/hosts']],
    ['dns', 'scutil', ['--dns']],
    ['host-query', 'dscacheutil', ['-q', 'host', '-a', 'name', 'app-staging.useorbit.org']],
    ['mdns', '/usr/bin/log', ['show', '--last', '2m', '--predicate', 'process == "mDNSResponder"']],
  ].map(([name, command, argumentsList]) => ({ command, argumentsList, log: join(output, `origin-isolation-${name}.log`) }))
  const results = await Promise.allSettled(commands.map(({ command, argumentsList, log }) => execute(command, argumentsList, { log })))
  const captures = commands.map((command, index) => ({ ...command,
    error: results[index].status === 'rejected' ? results[index].reason.message : null }))
  await writeFile(join(output, 'origin-isolation-diagnostics.log'), `${JSON.stringify({ error: failure.message, commands: captures }, null, 2)}\n`)
}

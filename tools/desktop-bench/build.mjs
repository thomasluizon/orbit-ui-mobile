import { createRequire } from 'node:module'
import { existsSync, realpathSync } from 'node:fs'
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { homedir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { execute, logicalSize } from './host.mjs'
import { median } from './measurements.mjs'

const require = createRequire(import.meta.url)
export const benchmarkViewport = Object.freeze([900, 600])

export function electronInstallArguments(electron, version) {
  return ['install', '--prefix', electron, '--package-lock=false', '--no-audit', '--fund=false', '--save-dev', '--save-exact', `electron@${version}`, 'electron-builder@26.18.0']
}

// GitHub releases/download answers 5xx and 429 during outages, and @electron/get 5 (FetchDownloader) tries once. Its
// HTTPError keeps the fetch Response, and a failed connection rejects fetch with a TypeError.
export function retryableDownloadFailure(error) {
  if (error?.name === 'HTTPError') return error.response?.status >= 500 || error.response?.status === 429
  return error instanceof TypeError
}

export const electronDownloadDelays = Object.freeze([15000, 30000, 60000, 120000])

// The electron package's install.js passes its own checksums.json and electron_config_cache to @electron/get
// downloadArtifact, which validates every cache hit against those checksums. A cache directory named by the artifact
// checksum is therefore keyed by the exact version and file, and a verified download here is the hit install.js reads.
export async function cacheElectronArtifact(electron, { platform = process.platform, arch = process.arch, cacheBase,
  load = (path) => import(pathToFileURL(path).href), delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  delays = electronDownloadDelays, log = (line) => process.stderr.write(`${line}\n`) } = {}) {
  const manifest = JSON.parse(await readFile(join(electron, 'node_modules/electron/package.json'), 'utf8'))
  const checksums = JSON.parse(await readFile(join(electron, 'node_modules/electron/checksums.json'), 'utf8'))
  const file = `electron-v${manifest.version}-${platform}-${arch}.zip`
  const checksum = checksums[file]
  if (!/^[0-9a-f]{64}$/.test(checksum ?? '')) throw new Error(`electron ${manifest.version} checksums.json has no SHA-256 for ${file}`)
  const cacheRoot = join(cacheBase, checksum)
  const { downloadArtifact } = await load(join(electron, 'node_modules/@electron/get/dist/index.js'))
  for (let attempt = 0; ; attempt++) {
    try {
      await downloadArtifact({ version: manifest.version, artifactName: 'electron', platform, arch, cacheRoot, checksums })
      return { version: manifest.version, file, checksum, cacheRoot, attempts: attempt + 1 }
    } catch (error) {
      if (attempt >= delays.length || !retryableDownloadFailure(error)) throw error
      log(`Electron download attempt ${attempt + 1} failed: ${error.message}; retrying in ${delays[attempt] / 1000} s`)
      await delay(delays[attempt])
    }
  }
}

export function normalizeElectronArchiveEntries(output) {
  return output.split(/\r?\n/).filter((entry) => entry !== '').map((entry) => entry.replace(/\\/g, '/')).sort()
}

export function electronMainSource() {
  return `const { app, BrowserWindow, Menu } = require('electron');
app.setPath('userData', process.env.ORBIT_BENCH_PROFILE);
app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  const width = Number(process.env.ORBIT_BENCH_WIDTH);
  const height = Number(process.env.ORBIT_BENCH_HEIGHT);
  const window = new BrowserWindow({ width, height, useContentSize: true, enableLargerThanScreen: true, webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true } });
  window.setContentSize(width, height);
  app.focus({ steal: true });
  window.focus();
  window.webContents.on('console-message', (details) => process.stderr.write(details.message + '\\n'));
  window.loadURL('http://127.0.0.1:3400/');
});
app.on('window-all-closed', () => app.quit());
`
}

export function tauriBenchmarkOverlay(profile) {
  const origin = 'http://127.0.0.1:3400'
  const [width, height] = benchmarkViewport
  // macOS full-size content views apply min/max constraints to the frame, shrinking the webview.
  return {
    identifier: 'org.useorbit.desktop.benchmark', productName: 'Orbit Benchmark Tauri',
    build: { frontendDist: origin },
    app: { windows: [{ label: 'main', create: false, title: 'Orbit Benchmark Tauri', url: `${origin}/`, width, height,
      resizable: false, dataDirectory: profile }],
      security: { capabilities: [{ identifier: 'desktop-benchmark', local: true, remote: { urls: [`${origin}/*`] }, windows: ['main'], permissions: ['allow-commit-desktop-login', 'allow-desktop-push', 'allow-desktop-update', 'allow-fit-bench-viewport'] }] } },
    bundle: { createUpdaterArtifacts: false },
    plugins: { 'deep-link': { desktop: { schemes: ['org.useorbit.desktop.benchmark'] } }, updater: { pubkey: '' } },
  }
}

async function diskMeasurements(paths, installer) {
  const installedSamplesBytes = []
  const installerSamplesBytes = []
  for (let index = 0; index < 5; index++) {
    installedSamplesBytes.push((await Promise.all(paths.map(logicalSize))).reduce((sum, size) => sum + size, 0))
    installerSamplesBytes.push(await logicalSize(installer))
  }
  return { installedBytes: median(installedSamplesBytes), installerBytes: median(installerSamplesBytes), installedSamplesBytes, installerSamplesBytes }
}

export function npmCli() {
  const candidates = [process.env.npm_execpath, join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'), join(dirname(process.execPath), '../lib/node_modules/npm/bin/npm-cli.js')]
  const found = candidates.find((path) => path && existsSync(path))
  if (!found) throw new Error('Cannot locate the installed npm CLI next to Node')
  return realpathSync(found)
}

export async function buildShells(repository, work, environment) {
  const desktop = join(repository, 'apps/desktop')
  const electron = join(work, 'electron')
  await mkdir(electron, { recursive: true })
  const npm = npmCli()
  // The workflow resolves the version once, so its Electron cache key and this install name the same release.
  const version = environment.ORBIT_ELECTRON_VERSION || (await execute(process.execPath, [npm, 'view', 'electron', 'version'], { cwd: work })).trim()
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`Expected stable Electron version, received ${version}`)
  await execute(process.execPath, [npm, ...electronInstallArguments(electron, version)], { cwd: work, log: join(work, 'electron-build.log') })
  const artifact = await cacheElectronArtifact(electron, { cacheBase: environment.ORBIT_ELECTRON_CACHE || join(work, 'electron-cache') })
  await execute(process.execPath, [join(electron, 'node_modules/electron/install.js')], {
    cwd: electron, env: { ...environment, electron_config_cache: artifact.cacheRoot }, log: join(work, 'electron-build.log'),
  })
  const application = join(electron, 'application')
  await mkdir(application, { recursive: true })
  await writeFile(join(application, 'package.json'), JSON.stringify({ name: 'orbit-benchmark', productName: 'Orbit Benchmark Electron', version: '0.1.0', main: 'main.cjs', description: 'Hermetic desktop measurement shell', author: 'Orbit' }))
  await writeFile(join(application, 'main.cjs'), electronMainSource())
  const builderConfig = {
    appId: 'org.useorbit.desktop.benchmark.electron', productName: 'Orbit Benchmark Electron',
    directories: { app: application, output: join(electron, 'dist') },
    electronVersion: version, electronDist: join(electron, 'node_modules/electron/dist'),
    files: ['main.cjs', 'package.json'], npmRebuild: false,
    mac: { target: ['dmg'], identity: null }, win: { target: ['nsis'], signAndEditExecutable: false },
    artifactName: 'orbit-electron.${ext}', publish: [],
  }
  const configPath = join(work, 'electron-builder.json')
  await writeFile(configPath, JSON.stringify(builderConfig))
  await execute(process.execPath, [join(electron, 'node_modules/electron-builder/out/cli/cli.js'), '--config', configPath, process.platform === 'darwin' ? '--mac' : '--win', '--publish', 'never', `--${process.arch}`], {
    cwd: electron, env: { ...environment, CSC_IDENTITY_AUTO_DISCOVERY: 'false' }, log: join(work, 'electron-build.log'),
  })
  const profile = join(work, 'tauri-profile')
  const overlay = tauriBenchmarkOverlay(profile)
  const overlayPath = join(work, 'tauri-benchmark.json')
  await writeFile(overlayPath, JSON.stringify(overlay))
  await execute(process.execPath, [require.resolve('@tauri-apps/cli/tauri.js'), 'build', '--config', overlayPath, '--features', 'bench-loopback', '--bundles', process.platform === 'darwin' ? 'app' : 'nsis', '--no-sign', '--', '--locked'], { cwd: desktop, env: environment, log: join(work, 'tauri-build.log') })
  const release = join(desktop, 'src-tauri/target/release')
  const tauriBundle = process.platform === 'darwin' ? join(release, 'bundle/macos/Orbit Benchmark Tauri.app') : release
  const electronBundle = join(electron, 'dist', process.platform === 'darwin' ? `mac${process.arch === 'arm64' ? '-arm64' : ''}/Orbit Benchmark Electron.app` : 'win-unpacked')
  const archive = join(electronBundle, process.platform === 'darwin' ? 'Contents/Resources/app.asar' : 'resources/app.asar')
  const entries = normalizeElectronArchiveEntries(await execute(process.execPath, [join(electron, 'node_modules/@electron/asar/bin/asar.js'), 'list', archive]))
  if (entries.join(',') !== '/main.cjs,/package.json') throw new Error('Electron archive must contain only the generated shell and manifest')
  let tauriInstaller
  if (process.platform === 'darwin') {
    tauriInstaller = join(work, 'orbit-tauri.dmg')
    await execute('hdiutil', ['create', '-ov', '-format', 'UDZO', '-volname', 'Orbit Benchmark Tauri', '-srcfolder', tauriBundle, tauriInstaller], { log: join(work, 'tauri-build.log') })
  } else {
    const directory = join(release, 'bundle/nsis')
    const names = (await readdir(directory)).filter((name) => name.endsWith('.exe'))
    if (names.length !== 1) throw new Error('Expected one Tauri installer')
    tauriInstaller = join(directory, names[0])
  }
  const tauriExecutable = process.platform === 'darwin' ? join(tauriBundle, 'Contents/MacOS/orbit-desktop') : join(release, 'orbit-desktop.exe')
  const electronExecutable = process.platform === 'darwin' ? join(electronBundle, 'Contents/MacOS/Orbit Benchmark Electron') : join(electronBundle, 'Orbit Benchmark Electron.exe')
  const windowsInstalled = process.platform === 'win32' ? [tauriExecutable] : [tauriBundle]
  return {
    version, tauriExecutable, electronExecutable, profile,
    macStorage: [join(homedir(), 'Library/WebKit/org.useorbit.desktop.benchmark'), join(homedir(), 'Library/Caches/org.useorbit.desktop.benchmark'), join(homedir(), 'Library/Application Support/org.useorbit.desktop.benchmark')],
    disk: {
      tauri: await diskMeasurements(windowsInstalled, tauriInstaller),
      electron: await diskMeasurements([electronBundle], join(electron, 'dist', process.platform === 'darwin' ? 'orbit-electron.dmg' : 'orbit-electron.exe')),
    },
  }
}

export async function readFixtures(path) {
  return JSON.parse(await readFile(path, 'utf8'))
}

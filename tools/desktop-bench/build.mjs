import { createRequire } from 'node:module'
import { existsSync, realpathSync } from 'node:fs'
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { homedir } from 'node:os'
import { execute, logicalSize } from './host.mjs'
import { median } from './measurements.mjs'

const require = createRequire(import.meta.url)

export function electronInstallArguments(electron, version) {
  return ['install', '--prefix', electron, '--package-lock=false', '--no-audit', '--fund=false', '--save-dev', '--save-exact', `electron@${version}`, 'electron-builder@26.18.0']
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

function npmCli() {
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
  const version = (await execute(process.execPath, [npm, 'view', 'electron', 'version'], { cwd: work })).trim()
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`Expected stable Electron version, received ${version}`)
  await execute(process.execPath, [npm, ...electronInstallArguments(electron, version)], { cwd: work, log: join(work, 'electron-build.log') })
  await execute(process.execPath, [join(electron, 'node_modules/electron/install.js')], { cwd: electron, log: join(work, 'electron-build.log') })
  const application = join(electron, 'application')
  await mkdir(application, { recursive: true })
  await writeFile(join(application, 'package.json'), JSON.stringify({ name: 'orbit-benchmark', productName: 'Orbit Benchmark Electron', version: '0.1.0', main: 'main.cjs', description: 'Hermetic desktop measurement shell', author: 'Orbit' }))
  await writeFile(join(application, 'main.cjs'), `const { app, BrowserWindow } = require('electron');
app.setPath('userData', process.env.ORBIT_BENCH_PROFILE);
app.whenReady().then(() => {
  const window = new BrowserWindow({ width: Number(process.env.ORBIT_BENCH_WIDTH), height: Number(process.env.ORBIT_BENCH_HEIGHT), useContentSize: true, webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true } });
  app.focus({ steal: true });
  window.focus();
  window.loadURL('http://127.0.0.1:3400/');
});
app.on('window-all-closed', () => app.quit());
`)
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
  const origin = 'http://127.0.0.1:3400'
  const profile = join(work, 'tauri-profile')
  const overlay = {
    identifier: 'org.useorbit.desktop.benchmark', productName: 'Orbit Benchmark Tauri',
    build: { frontendDist: origin },
    app: { windows: [{ label: 'main', create: false, title: 'Orbit Benchmark Tauri', url: `${origin}/`, width: 900, height: 800, dataDirectory: profile }],
      security: { capabilities: [{ identifier: 'desktop-benchmark', local: true, remote: { urls: [`${origin}/*`] }, windows: ['main'], permissions: ['allow-commit-desktop-login', 'allow-desktop-push', 'allow-desktop-update'] }] } },
    bundle: { createUpdaterArtifacts: false }, plugins: { updater: { pubkey: '' } },
  }
  const overlayPath = join(work, 'tauri-benchmark.json')
  await writeFile(overlayPath, JSON.stringify(overlay))
  await execute(process.execPath, [require.resolve('@tauri-apps/cli/tauri.js'), 'build', '--config', overlayPath, '--features', 'bench-loopback', '--bundles', process.platform === 'darwin' ? 'app' : 'nsis', '--no-sign', '--', '--locked'], { cwd: desktop, env: environment, log: join(work, 'tauri-build.log') })
  const release = join(desktop, 'src-tauri/target/release')
  const tauriBundle = process.platform === 'darwin' ? join(release, 'bundle/macos/Orbit Benchmark Tauri.app') : release
  const electronBundle = join(electron, 'dist', process.platform === 'darwin' ? `mac${process.arch === 'arm64' ? '-arm64' : ''}/Orbit Benchmark Electron.app` : 'win-unpacked')
  const archive = join(electronBundle, process.platform === 'darwin' ? 'Contents/Resources/app.asar' : 'resources/app.asar')
  const entries = (await execute(process.execPath, [join(electron, 'node_modules/@electron/asar/bin/asar.js'), 'list', archive])).trim().split('\n').sort()
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

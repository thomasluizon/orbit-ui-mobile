import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { downloadReleaseAsset, findRelease, ReleaseAssetError, type ReleaseAssets, type Sleep } from './release-asset.ts'

interface Pin { repository: string; tag: string; asset: string; sha1: string }
export interface NsisPins {
  archive: Pin & { directory: string }
  executableSha1: string
  utils: Pin
  requiredFiles: string[]
}

export interface NsisDependencies {
  download: (pin: Pin) => Promise<Buffer>
  extract: (archive: Buffer, destination: string) => void
}

const pinsPath = new URL('../src-tauri/native/windows/nsis-tools.json', import.meta.url)
export const nsisPins: NsisPins = JSON.parse(readFileSync(pinsPath, 'utf8'))
const utilsPath = 'Plugins/x86-unicode/additional/nsis_tauri_utils.dll'

function sha1Of(path: string): string | null {
  return existsSync(path) ? createHash('sha1').update(readFileSync(path)).digest('hex').toUpperCase() : null
}

// WHY: tauri-bundler 2.10.4 reuses `<cache dir>/tauri/NSIS` only when these exact files and hashes are present, and downloads otherwise.
export function nsisToolsComplete(nsisDirectory: string, pins: NsisPins = nsisPins): boolean {
  return pins.requiredFiles.every(file => existsSync(join(nsisDirectory, file)))
    && sha1Of(join(nsisDirectory, 'NSIS.exe')) === pins.executableSha1
    && sha1Of(join(nsisDirectory, utilsPath)) === pins.utils.sha1
}

function verified(data: Buffer, pin: Pin): Buffer {
  const actual = createHash('sha1').update(data).digest('hex').toUpperCase()
  if (actual !== pin.sha1) throw new Error(`SHA-1 mismatch for ${pin.asset}: expected ${pin.sha1}, got ${actual}`)
  return data
}

export async function ensureNsisTools(toolsDirectory: string, dependencies: NsisDependencies, pins: NsisPins = nsisPins): Promise<'present' | 'installed'> {
  const nsisDirectory = join(toolsDirectory, 'NSIS')
  if (nsisToolsComplete(nsisDirectory, pins)) return 'present'
  const staging = join(toolsDirectory, 'NSIS.partial')
  rmSync(staging, { recursive: true, force: true })
  rmSync(nsisDirectory, { recursive: true, force: true })
  mkdirSync(staging, { recursive: true })
  dependencies.extract(verified(await dependencies.download(pins.archive), pins.archive), staging)
  renameSync(join(staging, pins.archive.directory), nsisDirectory)
  rmSync(staging, { recursive: true, force: true })
  const utils = join(nsisDirectory, utilsPath)
  mkdirSync(join(utils, '..'), { recursive: true })
  writeFileSync(utils, verified(await dependencies.download(pins.utils), pins.utils))
  if (!nsisToolsComplete(nsisDirectory, pins)) throw new Error('NSIS tools are incomplete after installation')
  return 'installed'
}

export function extractZip(archive: Buffer, destination: string) {
  const file = join(destination, 'archive.zip')
  writeFileSync(file, archive)
  // WHY: Git Bash puts GNU tar first on PATH, and only the Windows bsdtar reads zip files.
  const command = process.platform === 'win32' ? join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe') : 'unzip'
  const args = process.platform === 'win32' ? ['-xf', file, '-C', destination] : ['-q', file, '-d', destination]
  const result = spawnSync(command, args, { encoding: 'utf8' })
  if (result.status !== 0) throw new Error(`Cannot extract ${file}: ${result.stderr || result.error?.message}`)
  rmSync(file)
}

export function releaseDownloader(sleep?: Sleep): NsisDependencies['download'] {
  const releases = new Map<string, Promise<ReleaseAssets | null>>()
  return async pin => {
    const key = `${pin.repository}@${pin.tag}`
    if (!releases.has(key)) releases.set(key, findRelease(pin.repository, pin.tag, sleep))
    const release = await releases.get(key)
    if (!release) throw new ReleaseAssetError(404, `${pin.repository} has no release ${pin.tag}`)
    return downloadReleaseAsset(pin.repository, release, pin.asset, sleep)
  }
}

async function main() {
  const localAppData = process.env.LOCALAPPDATA
  if (process.platform !== 'win32' || !localAppData) throw new Error('NSIS tools install only on Windows with LOCALAPPDATA set')
  // WHY: the bundler reads dirs::cache_dir(), which is the Local AppData folder on Windows.
  const outcome = await ensureNsisTools(join(localAppData, 'tauri'), { download: releaseDownloader(), extract: extractZip })
  console.log(`NSIS tools ${outcome} at ${join(localAppData, 'tauri', 'NSIS')}`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main()

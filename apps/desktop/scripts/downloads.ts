import { createHash } from 'node:crypto'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { artifactName, releaseSettings, targets, verifyArtifact } from './release.ts'

export function downloadName(target: string) {
  if (!Object.hasOwn(targets, target)) throw new Error('Unknown desktop target')
  const extension = target.endsWith('apple-darwin') ? '.dmg' : '.exe'
  return `orbit-${target}${extension}`
}

function versionedDownloadName(version: string, target: string) {
  return artifactName('production', version, target).replace('.app.tar.gz', '.dmg')
}

export function collectDmg(version: string, target: string, bundle: string, output: string) {
  const name = versionedDownloadName(version, target)
  if (!name.endsWith('.dmg')) throw new Error('Expected a macOS target')
  const directory = resolve(bundle, 'dmg')
  const candidates = readdirSync(directory).filter(entry => entry.endsWith('.dmg'))
  if (candidates.length !== 1) throw new Error(`Expected one DMG for ${target}`)
  mkdirSync(output, { recursive: true })
  copyFileSync(resolve(directory, candidates[0]!), resolve(output, name))
}

interface Download { name: string; sha256: string; size: number }

function checksum(bytes: Buffer) { return createHash('sha256').update(bytes).digest('hex') }
function sums(downloads: Download[]) { return downloads.map(file => `${file.sha256}  ${file.name}\n`).join('') }

export function prepareDownloads(version: string, directory: string, output: string, publicKey: string) {
  mkdirSync(dirname(output), { recursive: true })
  const staging = mkdtempSync(join(dirname(output), '.desktop-downloads-'))
  const downloads: Download[] = []
  try {
    for (const target of Object.keys(targets)) {
      const source = resolve(directory, versionedDownloadName(version, target))
      const bytes = readFileSync(source)
      verifyArtifact(bytes, readFileSync(`${source}.sig`, 'utf8'), publicKey, version, basename(source))
      const name = downloadName(target)
      writeFileSync(resolve(staging, name), bytes)
      downloads.push({ name, sha256: checksum(bytes), size: bytes.length })
    }
    writeFileSync(resolve(staging, 'SHA256SUMS'), sums(downloads))
    writeFileSync(resolve(staging, 'downloads.json'), `${JSON.stringify(downloads, null, 2)}\n`)
    renameSync(staging, output)
  } finally {
    rmSync(staging, { recursive: true, force: true })
  }
}

export function verifyDownloads(directory: string) {
  const parsed: unknown = JSON.parse(readFileSync(resolve(directory, 'downloads.json'), 'utf8'))
  const inventoryMismatch = 'Desktop download inventory does not match its targets'
  if (!Array.isArray(parsed)) throw new Error(inventoryMismatch)
  const downloads = parsed as Download[]
  const expected = Object.keys(targets).map(downloadName).sort((left, right) => left.localeCompare(right))
  const actual = downloads.map(file => file.name).sort((left, right) => left.localeCompare(right))
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(inventoryMismatch)
  for (const file of downloads) {
    const bytes = readFileSync(resolve(directory, file.name))
    if (checksum(bytes) !== file.sha256 || bytes.length !== file.size) throw new Error('Desktop download checksum or size mismatch')
  }
  if (readFileSync(resolve(directory, 'SHA256SUMS'), 'utf8') !== sums(downloads)) throw new Error('Desktop download checksums changed')
}

function main() {
  const [command, variant = '', version = '', ...args] = process.argv.slice(2)
  releaseSettings(variant, version)
  if (variant !== 'production') throw new Error('Stable downloads require production')
  switch (command) {
    case 'collect-dmg':
      collectDmg(version, args[0]!, args[1]!, args[2]!)
      break
    case 'verify':
      verifyDownloads(args[0]!)
      break
    case 'prepare':
      prepareDownloads(version, args[0]!, args[1]!, process.env.TAURI_SIGNING_PUBLIC_KEY ?? '')
      break
    default:
      throw new Error('Unknown desktop download command')
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()

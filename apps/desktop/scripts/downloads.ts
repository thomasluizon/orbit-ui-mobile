import { copyFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
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

export function prepareDownloads(version: string, directory: string, output: string, publicKey: string) {
  const downloads = Object.keys(targets).map(target => {
    const source = resolve(directory, versionedDownloadName(version, target))
    const bytes = readFileSync(source)
    verifyArtifact(bytes, readFileSync(`${source}.sig`, 'utf8'), publicKey, version)
    return { name: downloadName(target), bytes }
  })
  mkdirSync(output, { recursive: true })
  for (const { name, bytes } of downloads) writeFileSync(resolve(output, name), bytes)
}

function main() {
  const [command, variant = '', version = '', ...args] = process.argv.slice(2)
  releaseSettings(variant, version)
  if (variant !== 'production') throw new Error('Stable downloads require production')
  switch (command) {
    case 'collect-dmg':
      collectDmg(version, args[0]!, args[1]!, args[2]!)
      break
    case 'prepare':
      prepareDownloads(version, args[0]!, args[1]!, process.env.TAURI_SIGNING_PUBLIC_KEY ?? '')
      break
    default:
      throw new Error('Unknown desktop download command')
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()

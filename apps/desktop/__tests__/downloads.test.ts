import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, expect, it } from 'vitest'
import vector from '../__fixtures__/signer-vector.json'
import { collectDmg, downloadName, prepareDownloads } from '../scripts/downloads.ts'
import { artifactName, collectArtifact, targets } from '../scripts/release.ts'

const directories: string[] = []
function workspace() {
  const directory = mkdtempSync(join(tmpdir(), 'orbit-desktop-downloads-'))
  directories.push(directory)
  return directory
}
afterEach(() => directories.splice(0).forEach(directory => rmSync(directory, { recursive: true, force: true })))

function collectedDownloads() {
  const directory = workspace()
  const output = join(directory, 'collected')
  for (const target of Object.keys(targets)) {
    const macos = target.endsWith('apple-darwin')
    const bundle = join(directory, target)
    const source = join(bundle, macos ? 'dmg' : 'nsis')
    mkdirSync(source, { recursive: true })
    writeFileSync(join(source, macos ? 'Orbit_2.0.0.dmg' : 'Orbit_2.0.0-setup.exe'), vector.payload)
    if (macos) collectDmg(vector.version, target, bundle, output)
    else collectArtifact('production', vector.version, target, bundle, output)
    const name = artifactName('production', vector.version, target).replace('.app.tar.gz', '.dmg')
    writeFileSync(join(output, `${name}.sig`), vector.signature)
  }
  return { directory, output }
}

it('copies the complete signed installer set to exact version-free download names', () => {
  const { directory, output } = collectedDownloads()
  const destination = join(directory, 'fixed')
  prepareDownloads(vector.version, output, destination, vector.publicKey)
  expect(readdirSync(destination).sort()).toEqual([
    'orbit-aarch64-apple-darwin.dmg', 'orbit-aarch64-pc-windows-msvc.exe',
    'orbit-x86_64-apple-darwin.dmg', 'orbit-x86_64-pc-windows-msvc.exe',
  ])
  for (const target of Object.keys(targets)) {
    expect(readFileSync(join(destination, downloadName(target)), 'utf8')).toBe(vector.payload)
  }
})

it.each(['missing', 'tampered', 'signature'])('rejects a %s installer before preparing any fixed downloads', (failure) => {
  const { directory, output } = collectedDownloads()
  const source = join(output, artifactName('production', vector.version, 'aarch64-pc-windows-msvc'))
  if (failure === 'missing') rmSync(source)
  else writeFileSync(failure === 'signature' ? `${source}.sig` : source, 'changed')
  const destination = join(directory, 'fixed')
  expect(() => prepareDownloads(vector.version, output, destination, vector.publicKey)).toThrow()
  expect(existsSync(destination)).toBe(false)
})

it.each(['aarch64-apple-darwin', 'x86_64-apple-darwin'])('requires exactly one %s DMG from the bundler', (target) => {
  const directory = workspace()
  mkdirSync(join(directory, 'dmg'))
  const output = join(directory, 'collected')
  expect(() => collectDmg(vector.version, target, directory, output)).toThrow('Expected one DMG')
  writeFileSync(join(directory, 'dmg/Orbit.dmg'), vector.payload)
  collectDmg(vector.version, target, directory, output)
  writeFileSync(join(directory, 'dmg/extra.dmg'), vector.payload)
  expect(() => collectDmg(vector.version, target, directory, output)).toThrow('Expected one DMG')
})

it('rejects unsupported targets and channels', () => {
  for (const target of ['../escape', 'unknown', 'constructor']) {
    expect(() => downloadName(target)).toThrow('Unknown desktop target')
  }
  expect(() => collectDmg(vector.version, 'x86_64-pc-windows-msvc', '', '')).toThrow('Expected a macOS target')
  const result = spawnSync(process.execPath, ['--experimental-strip-types',
    fileURLToPath(new URL('../scripts/downloads.ts', import.meta.url)), 'prepare', 'staging', vector.version], { encoding: 'utf8' })
  expect(result.status).not.toBe(0)
  expect(result.stderr).toContain('Stable downloads require production')
})

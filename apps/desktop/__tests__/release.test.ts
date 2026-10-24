import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import vector from '../__fixtures__/signer-vector.json'
import staging from '../__fixtures__/latest-staging.json'
import production from '../__fixtures__/latest-production.json'
import {
  artifactName, assertNewerVersion, buildManifest, collectArtifact, releaseConfig,
  releaseSettings, targets, verifyArtifact, writeManifest,
} from '../scripts/release.ts'

const directories: string[] = []
function workspace() {
  const directory = mkdtempSync(join(tmpdir(), 'orbit-desktop-release-'))
  directories.push(directory)
  return directory
}

afterEach(() => directories.splice(0).forEach((directory) => rmSync(directory, { recursive: true, force: true })))

function signatures(variant: string) {
  return Object.fromEntries(Object.keys(targets).map((target) => [artifactName(variant, vector.version, target), vector.signature]))
}

function artifactSet(variant: string) {
  const directory = workspace()
  for (const target of Object.keys(targets)) {
    const name = artifactName(variant, vector.version, target)
    writeFileSync(join(directory, name), vector.payload)
    writeFileSync(join(directory, `${name}.sig`), vector.signature)
  }
  return directory
}

describe.each(['staging', 'production'])('%s release', (variant) => {
  it('carries the actual public key and version into the channel config', () => {
    const config = releaseConfig(variant, vector.version, vector.publicKey)
    expect(config.version).toBe(vector.version)
    expect(config.plugins.updater.pubkey).toBe(vector.publicKey)
    expect(config.plugins.updater.endpoints).toEqual([
      `https://github.com/thomasluizon/orbit-ui-mobile/releases/download/desktop-${variant}/latest.json`,
    ])
    expect(config.plugins.updater.requireSignedVersion).toBe(true)
    expect(config.bundle.createUpdaterArtifacts).toBe(true)
    expect(config).not.toHaveProperty('privateKey')
  })

  it('produces the exact four-platform manifest consumed by the Rust tests', () => {
    const expected = variant === 'staging' ? staging : production
    expect(buildManifest(variant, vector.version, signatures(variant))).toEqual(expected)
    const directory = artifactSet(variant)
    expect(writeManifest(variant, vector.version, directory, vector.publicKey)).toEqual(expected)
    expect(JSON.parse(readFileSync(join(directory, 'latest.json'), 'utf8'))).toEqual(expected)
  })

  it('rejects an incomplete platform set before writing a manifest', () => {
    const directory = artifactSet(variant)
    const name = artifactName(variant, vector.version, 'aarch64-pc-windows-msvc')
    rmSync(join(directory, name))
    expect(() => writeManifest(variant, vector.version, directory, vector.publicKey)).toThrow()
    expect(() => readFileSync(join(directory, 'latest.json'))).toThrow()
    const incomplete = signatures(variant)
    delete incomplete[name]
    expect(() => buildManifest(variant, vector.version, incomplete)).toThrow('Missing updater signature')
  })
})

it('verifies a real CLI signature and rejects changed payloads, keys, versions and trusted comments', () => {
  const bytes = Buffer.from(vector.payload)
  expect(() => verifyArtifact(bytes, vector.signature, vector.publicKey, vector.version)).not.toThrow()
  expect(() => verifyArtifact(Buffer.from('changed'), vector.signature, vector.publicKey, vector.version)).toThrow('verification failed')
  expect(() => verifyArtifact(bytes, vector.signature, vector.publicKey, '2.0.1')).toThrow('release version')
  const forged = Buffer.from(Buffer.from(vector.signature, 'base64').toString().replace('version:2.0.0', 'version:2.0.1')).toString('base64')
  expect(() => verifyArtifact(bytes, forged, vector.publicKey, '2.0.1')).toThrow('verification failed')
  const publicLines = Buffer.from(vector.publicKey, 'base64').toString().split('\n')
  const changedKey = Buffer.from(publicLines[1]!, 'base64')
  changedKey[2] = changedKey[2]! ^ 1
  publicLines[1] = changedKey.toString('base64')
  const wrongKey = Buffer.from(publicLines.join('\n')).toString('base64')
  expect(() => verifyArtifact(bytes, vector.signature, wrongKey, vector.version)).toThrow('configured key')
  expect(() => verifyArtifact(bytes, 'invalid', vector.publicKey, vector.version)).toThrow()
  expect(() => releaseConfig('staging', vector.version, '')).toThrow()
})

it.each(Object.entries(targets))('collects one %s updater package using the bundler extension', (target, descriptor) => {
  const directory = workspace()
  const bundle = join(directory, descriptor.directory)
  mkdirSync(bundle)
  const output = join(directory, 'collected')
  expect(() => collectArtifact('staging', vector.version, target, directory, output)).toThrow('Expected one')
  const source = join(bundle, `Orbit Staging${descriptor.extension}`)
  writeFileSync(source, vector.payload)
  const destination = collectArtifact('staging', vector.version, target, directory, output)
  expect(readFileSync(destination, 'utf8')).toBe(vector.payload)
  expect(destination).toBe(join(output, artifactName('staging', vector.version, target)))
  writeFileSync(join(bundle, `extra${descriptor.extension}`), vector.payload)
  expect(() => collectArtifact('staging', vector.version, target, directory, output)).toThrow('Expected one')
})

it.each(['../production', '', 'development'])('rejects unknown channel %s', (variant) => {
  expect(() => releaseSettings(variant, '1.2.3')).toThrow('Unknown desktop variant')
})

it.each(['1.2', 'v1.2.3', '01.2.3', '1.2.3-beta', '1.2.3; echo secret', '9007199254740992.0.0'])('rejects version %s', (version) => {
  expect(() => releaseSettings('production', version)).toThrow('Desktop version')
})

it('accepts only an increasing numeric channel version', () => {
  expect(() => assertNewerVersion('staging', '2.10.0', { version: '2.9.9' })).not.toThrow()
  for (const previous of [{ version: '2.10.0' }, { version: '3.0.0' }, { version: 'invalid' }, {}, null]) {
    expect(() => assertNewerVersion('staging', '2.10.0', previous)).toThrow()
  }
  expect(() => artifactName('staging', '2.0.0', 'unknown')).toThrow('Unknown desktop target')
  expect(() => artifactName('staging', '2.0.0', 'constructor')).toThrow('Unknown desktop target')
})

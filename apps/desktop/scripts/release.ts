import { createHash, createPublicKey, verify } from 'node:crypto'
import { copyFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const repository = 'thomasluizon/orbit-ui-mobile'
export const targets = {
  'aarch64-apple-darwin': { platform: 'darwin-aarch64', directory: 'macos', extension: '.app.tar.gz' },
  'x86_64-apple-darwin': { platform: 'darwin-x86_64', directory: 'macos', extension: '.app.tar.gz' },
  'x86_64-pc-windows-msvc': { platform: 'windows-x86_64', directory: 'nsis', extension: '.exe' },
  'aarch64-pc-windows-msvc': { platform: 'windows-aarch64', directory: 'nsis', extension: '.exe' },
} as const

type Target = keyof typeof targets
export interface Manifest {
  version: string
  platforms: Record<string, { url: string; signature: string }>
}

export function releaseSettings(variant: string, version: string) {
  if (variant !== 'staging' && variant !== 'production') throw new Error('Unknown desktop variant')
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)
    || !version.split('.').every((part) => Number.isSafeInteger(Number(part)))) {
    throw new Error('Desktop version must have three numeric components without leading zeros')
  }
  return { variant, version, channel: `desktop-${variant}`, tag: `desktop-${variant}-v${version}` }
}

function decodeBase64(encoded: string): Buffer {
  const decoded = Buffer.from(encoded.trim(), 'base64')
  if (!decoded.length || decoded.toString('base64') !== encoded.trim()) throw new Error('Invalid signing encoding')
  return decoded
}

function publicKeyBytes(encoded: string): Buffer {
  const lines = decodeBase64(encoded).toString('utf8').trim().split(/\r?\n/)
  const bytes = decodeBase64(lines[1] ?? '')
  if (lines.length !== 2 || !lines[0]?.startsWith('untrusted comment:')
    || bytes.length !== 42 || !['Ed', 'ED'].includes(bytes.subarray(0, 2).toString())) {
    throw new Error('Invalid updater public key')
  }
  return bytes
}

export function releaseConfig(variant: string, version: string, publicKey: string) {
  const settings = releaseSettings(variant, version)
  publicKeyBytes(publicKey)
  return {
    version,
    bundle: { createUpdaterArtifacts: true },
    plugins: { updater: {
      endpoints: [`https://github.com/${repository}/releases/download/${settings.channel}/latest.json`],
      pubkey: publicKey.trim(),
      requireSignedVersion: true,
    } },
  }
}

export function artifactName(variant: string, version: string, target: string) {
  releaseSettings(variant, version)
  if (!Object.hasOwn(targets, target)) throw new Error('Unknown desktop target')
  return `orbit-${variant}-${version}-${target}${targets[target as Target].extension}`
}

export function verifyArtifact(bytes: Buffer, encodedSignature: string, encodedPublicKey: string, version: string) {
  const publicBytes = publicKeyBytes(encodedPublicKey)
  const lines = decodeBase64(encodedSignature).toString('utf8').trim().split(/\r?\n/)
  const signature = decodeBase64(lines[1] ?? '')
  const globalSignature = decodeBase64(lines[3] ?? '')
  const algorithm = signature.subarray(0, 2).toString()
  if (lines.length !== 4 || signature.length !== 74 || globalSignature.length !== 64
    || !['Ed', 'ED'].includes(algorithm) || !lines[2]?.startsWith('trusted comment: ')
    || !publicBytes.subarray(2, 10).equals(signature.subarray(2, 10))) {
    throw new Error('Updater signature does not match the configured key')
  }
  const comment = lines[2].slice('trusted comment: '.length)
  if (comment.split('\t').filter((part) => part.startsWith('version:')).join() !== `version:${version}`) {
    throw new Error('Updater signature does not match the release version')
  }
  const key = createPublicKey({
    key: { kty: 'OKP', crv: 'Ed25519', x: publicBytes.subarray(10).toString('base64url') },
    format: 'jwk',
  })
  const payload = algorithm === 'ED' ? createHash('blake2b512').update(bytes).digest() : bytes
  if (!verify(null, payload, key, signature.subarray(10))
    || !verify(null, Buffer.concat([signature.subarray(10), Buffer.from(comment)]), key, globalSignature)) {
    throw new Error('Updater signature verification failed')
  }
}

export function collectArtifact(variant: string, version: string, target: string, bundle: string, output: string) {
  const name = artifactName(variant, version, target)
  const descriptor = targets[target as Target]
  const directory = resolve(bundle, descriptor.directory)
  const candidates = readdirSync(directory).filter((entry) => entry.endsWith(descriptor.extension))
  if (candidates.length !== 1) throw new Error(`Expected one updater artifact for ${target}`)
  mkdirSync(output, { recursive: true })
  const destination = resolve(output, name)
  copyFileSync(resolve(directory, candidates[0]!), destination)
  return destination
}

export function buildManifest(variant: string, version: string, signatures: Record<string, string>): Manifest {
  const { tag } = releaseSettings(variant, version)
  const platforms: Manifest['platforms'] = {}
  for (const [target, descriptor] of Object.entries(targets)) {
    const name = artifactName(variant, version, target)
    const signature = signatures[name]?.trim()
    if (!signature) throw new Error(`Missing updater signature for ${target}`)
    platforms[descriptor.platform] = {
      url: `https://github.com/${repository}/releases/download/${tag}/${name}`,
      signature,
    }
  }
  return { version, platforms }
}

export function writeManifest(variant: string, version: string, directory: string, publicKey: string) {
  const signatures: Record<string, string> = {}
  for (const target of Object.keys(targets)) {
    const name = artifactName(variant, version, target)
    const bytes = readFileSync(resolve(directory, name))
    const signature = readFileSync(resolve(directory, `${name}.sig`), 'utf8')
    verifyArtifact(bytes, signature, publicKey, version)
    signatures[name] = signature
  }
  const manifest = buildManifest(variant, version, signatures)
  writeFileSync(resolve(directory, 'latest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  return manifest
}

export function assertNewerVersion(variant: string, version: string, previous: unknown) {
  releaseSettings(variant, version)
  if (!previous || typeof previous !== 'object' || !('version' in previous) || typeof previous.version !== 'string') {
    throw new Error('Previous channel manifest has no version')
  }
  releaseSettings(variant, previous.version)
  const current = version.split('.').map(Number)
  const old = previous.version.split('.').map(Number)
  const changed = current.findIndex((part, index) => part !== old[index])
  if (changed === -1 || current[changed]! < old[changed]!) throw new Error('Desktop release version must increase')
}

function main() {
  const [command, variant = '', version = '', ...args] = process.argv.slice(2)
  releaseSettings(variant, version)
  const publicKey = process.env.TAURI_SIGNING_PUBLIC_KEY ?? ''
  switch (command) {
    case 'prepare':
      writeFileSync(args[0]!, `${JSON.stringify(releaseConfig(variant, version, publicKey), null, 2)}\n`)
      break
    case 'collect':
      collectArtifact(variant, version, args[0]!, args[1]!, args[2]!)
      break
    case 'manifest':
      writeManifest(variant, version, args[0]!, publicKey)
      break
    case 'verify':
      verifyArtifact(readFileSync(args[0]!), readFileSync(`${args[0]}.sig`, 'utf8'), publicKey, version)
      break
    case 'newer':
      assertNewerVersion(variant, version, JSON.parse(readFileSync(args[0]!, 'utf8')))
      break
    default:
      throw new Error('Unknown desktop release command')
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()

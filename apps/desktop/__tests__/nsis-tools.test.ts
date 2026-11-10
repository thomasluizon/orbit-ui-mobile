import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { ensureNsisTools, nsisPins, releaseDownloader, type NsisPins } from '../scripts/nsis-tools.ts'

const sha1 = (data: string) => createHash('sha1').update(data).digest('hex').toUpperCase()
const directories: string[] = []
afterEach(() => {
  vi.unstubAllGlobals()
  directories.splice(0).forEach(directory => rmSync(directory, { recursive: true, force: true }))
})

const fixtureFiles = ['makensis.exe', 'Include/MUI2.nsh', 'NSIS.exe']
const pins: NsisPins = {
  archive: { repository: 'example/archive', tag: 'v1', asset: 'archive.zip', sha1: sha1('archive'), directory: 'nsis-fixture' },
  executableSha1: sha1('NSIS.exe'),
  utils: { repository: 'example/utils', tag: 'v2', asset: 'utils.dll', sha1: sha1('utils') },
  requiredFiles: ['makensis.exe', 'Include/MUI2.nsh', 'Plugins/x86-unicode/additional/nsis_tauri_utils.dll'],
}

function fixture(overrides: { utils?: string } = {}) {
  const tools = mkdtempSync(join(tmpdir(), 'nsis-tools-'))
  directories.push(tools)
  const download = vi.fn((pin: { asset: string }) => Promise.resolve(Buffer.from(pin.asset === 'utils.dll' ? (overrides.utils ?? 'utils') : 'archive')))
  const extract = vi.fn((_archive: Buffer, destination: string) => {
    for (const file of fixtureFiles) {
      const path = join(destination, 'nsis-fixture', file)
      mkdirSync(dirname(path), { recursive: true })
      writeFileSync(path, file === 'NSIS.exe' ? 'NSIS.exe' : file)
    }
  })
  return { tools, download, extract }
}

it('installs the pinned tools from verified downloads and then reuses them without a download', async () => {
  const { tools, download, extract } = fixture()
  expect(await ensureNsisTools(tools, { download, extract }, pins)).toBe('installed')
  expect(download).toHaveBeenCalledTimes(2)
  expect(readFileSync(join(tools, 'NSIS/Plugins/x86-unicode/additional/nsis_tauri_utils.dll'), 'utf8')).toBe('utils')
  expect(readdirSync(tools)).toEqual(['NSIS'])
  expect(await ensureNsisTools(tools, { download, extract }, pins)).toBe('present')
  expect(download).toHaveBeenCalledTimes(2)
})

it('replaces a cached tool whose hash differs from the pin', async () => {
  const { tools, download, extract } = fixture()
  await ensureNsisTools(tools, { download, extract }, pins)
  writeFileSync(join(tools, 'NSIS/Plugins/x86-unicode/additional/nsis_tauri_utils.dll'), 'tampered')
  expect(await ensureNsisTools(tools, { download, extract }, pins)).toBe('installed')
  rmSync(join(tools, 'NSIS/Include/MUI2.nsh'))
  expect(await ensureNsisTools(tools, { download, extract }, pins)).toBe('installed')
  expect(existsSync(join(tools, 'NSIS/Include/MUI2.nsh'))).toBe(true)
})

it('rejects a download that does not match its pinned hash and leaves the tools incomplete', async () => {
  const { tools, download, extract } = fixture({ utils: 'poisoned' })
  await expect(ensureNsisTools(tools, { download, extract }, pins)).rejects.toThrow('SHA-1 mismatch for utils.dll')
  const retry = fixture()
  expect(await ensureNsisTools(tools, { download: retry.download, extract: retry.extract }, pins)).toBe('installed')
})

it('downloads through the release asset endpoint while the release download path answers 504', async () => {
  const requests: string[] = []
  vi.stubGlobal('fetch', vi.fn((url: string) => {
    requests.push(url)
    if (url.startsWith('https://github.com/')) return Promise.resolve(new Response('Gateway Time-out', { status: 504 }))
    if (url.endsWith('/releases/tags/nsis_tauri_utils-v0.5.3')) return Promise.resolve(Response.json({ assets: [{ id: 345882097, name: 'nsis_tauri_utils.dll' }] }))
    if (url.endsWith('/releases/assets/345882097')) return Promise.resolve(new Response('dll'))
    return Promise.reject(new Error(`Unexpected request ${url}`))
  }))
  const download = releaseDownloader(() => Promise.resolve())
  expect((await download(nsisPins.utils)).toString()).toBe('dll')
  expect(requests).toEqual([
    'https://api.github.com/repos/tauri-apps/nsis-tauri-utils/releases/tags/nsis_tauri_utils-v0.5.3',
    'https://api.github.com/repos/tauri-apps/nsis-tauri-utils/releases/assets/345882097',
  ])
})

it('retries an asset download whose body fails partway through', async () => {
  let assetRequests = 0
  vi.stubGlobal('fetch', vi.fn((url: string) => {
    if (url.endsWith('/releases/tags/nsis_tauri_utils-v0.5.3')) return Promise.resolve(Response.json({ assets: [{ id: 345882097, name: 'nsis_tauri_utils.dll' }] }))
    if (!url.endsWith('/releases/assets/345882097')) return Promise.reject(new Error(`Unexpected request ${url}`))
    assetRequests++
    if (assetRequests > 1) return Promise.resolve(new Response('dll'))
    return Promise.resolve(new Response(new ReadableStream({ start: controller => controller.error(new TypeError('terminated')) })))
  }))
  expect((await releaseDownloader(() => Promise.resolve())(nsisPins.utils)).toString()).toBe('dll')
  expect(assetRequests).toBe(2)
})

it('pins the exact tools and hashes the installed Tauri CLI bundler downloads', () => {
  const cliPackages = join(import.meta.dirname, '../../../node_modules/@tauri-apps')
  const nativeBinary = readdirSync(cliPackages).filter(name => name.startsWith('cli-'))
    .flatMap(name => readdirSync(join(cliPackages, name)).filter(file => file.endsWith('.node')).map(file => join(cliPackages, name, file)))[0]!
  const binary = readFileSync(nativeBinary).toString('latin1')
  const { utils, archive } = nsisPins
  expect(binary).toContain(`https://github.com/${utils.repository}/releases/download/${utils.tag}/${utils.asset}`)
  expect(binary).toContain(utils.sha1)
  expect(binary).toContain(nsisPins.executableSha1)
  /** WHY: the NSIS archive constants compile only into the Windows bundler. */
  if (nativeBinary.includes('win32')) {
    expect(binary).toContain(`https://github.com/${archive.repository}/releases/download/${archive.tag}/${archive.asset}`)
    expect(binary).toContain(archive.sha1)
    for (const file of nsisPins.requiredFiles) expect(binary).toContain(file)
  }
})

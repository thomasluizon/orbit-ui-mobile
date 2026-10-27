import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, expect, it } from 'vitest'

const native = fileURLToPath(new URL('../src-tauri/native/windows', import.meta.url))
const shell = process.platform === 'win32' ? 'powershell.exe' : 'pwsh'
const available = spawnSync(shell, ['-NoProfile', '-Command', 'exit 0']).status === 0
// WHY: Windows CI uses the build's PowerShell host; other hosts run these cases when pwsh is installed.
const downloadTest = it.skipIf(!available && process.platform !== 'win32')
const directories: string[] = []
afterEach(() => directories.splice(0).forEach(directory => rmSync(directory, { recursive: true, force: true })))

function prepare(mode: string, cached?: string, architecture = 'x64', artifact = 'sdk', complete = false) {
  const directory = mkdtempSync(join(tmpdir(), 'orbit-windows-download-'))
  directories.push(directory)
  for (const filename of readdirSync(native).filter(filename => filename.endsWith('.ps1') || filename.endsWith('.json'))) {
    copyFileSync(join(native, filename), join(directory, filename))
  }
  const payload = 'verified package bytes'
  const hash = createHash('sha256').update(payload).digest('hex')
  const manifestPath = join(directory, 'downloads.json')
  if (existsSync(manifestPath)) {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, { sha256: string }>
    Object.values(manifest).forEach(artifact => { artifact.sha256 = hash })
    writeFileSync(manifestPath, JSON.stringify(manifest))
  }
  if (cached !== undefined) writeFileSync(join(directory, 'sdk.zip'), cached)
  const harness = join(directory, 'test.ps1')
  writeFileSync(harness, `
$ErrorActionPreference = 'Stop'
$script:attempts = 0
function Invoke-WebRequest {
    param($Uri, $OutFile, [switch]$UseBasicParsing, $TimeoutSec)
    if ($OutFile -like "*$($env:TEST_ARTIFACT)*") {
        $script:attempts++
        Add-Content (Join-Path $env:TEST_ROOT 'attempts') $script:attempts
    }
    if ($OutFile -like "*$($env:TEST_ARTIFACT)*" -and ($env:TEST_MODE -eq 'always' -or ($env:TEST_MODE -eq 'transient' -and $script:attempts -lt 3))) {
        [System.IO.File]::WriteAllText($OutFile, 'partial')
        throw 'simulated network failure'
    }
    $bytes = if ($env:TEST_MODE -eq 'wrong') { 'truncated' } else { 'verified package bytes' }
    [System.IO.File]::WriteAllText($OutFile, $bytes)
}
function Start-Sleep {
    param($Seconds)
    Add-Content (Join-Path $env:TEST_ROOT 'delays') $Seconds
}
function Expand-Archive {
    param($Path, $DestinationPath)
    if ([System.IO.File]::ReadAllText($Path) -ne 'verified package bytes') { throw 'Unverified archive reached extraction' }
    Write-Output 'verified archive reached extraction'
    if ($env:TEST_COMPLETE -ne 'true') { exit 0 }
    New-Item -ItemType Directory $DestinationPath -Force | Out-Null
}
function Invoke-Projection {
    $headers = Join-Path $env:TEST_ROOT 'projection/winrt'
    New-Item -ItemType Directory $headers -Force | Out-Null
    foreach ($header in @('base.h', 'Windows.Foundation.h', 'Windows.Foundation.Collections.h', 'Microsoft.Windows.PushNotifications.h')) {
        New-Item -ItemType File (Join-Path $headers $header) -Force | Out-Null
    }
    $global:LASTEXITCODE = 0
}
Set-Alias -Name (Join-Path $env:TEST_ROOT 'cppwinrt/bin/cppwinrt.exe') -Value Invoke-Projection
function Copy-Item {
    param($Path, $Destination, [switch]$Force)
    if ([System.IO.File]::ReadAllText($Path) -ne 'verified package bytes') { throw 'Unverified installer reached output' }
    Write-Output 'verified installer reached output'
    exit 0
}
& (Join-Path $env:TEST_ROOT 'prepare.ps1') -Architecture $env:TEST_ARCHITECTURE -Output $env:TEST_ROOT
`)
  const result = spawnSync(shell, ['-NoProfile', '-File', harness], {
    encoding: 'utf8', timeout: 20000,
    env: { ...process.env, TEST_ROOT: directory, TEST_MODE: mode, TEST_ARCHITECTURE: architecture, TEST_ARTIFACT: artifact,
      TEST_COMPLETE: String(complete), ORBIT_WINDOWS_DOWNLOAD_CACHE: directory },
  })
  const lines = (name: string) => existsSync(join(directory, name)) ? readFileSync(join(directory, name), 'utf8').trim().split(/\r?\n/).map(Number) : []
  return { result, directory, attempts: lines('attempts'), delays: lines('delays') }
}

downloadTest('prepares the SDK after two network failures with bounded backoff', () => {
  const { result, attempts, delays } = prepare('transient')
  expect(result.status, result.stderr).toBe(0)
  expect(result.stdout).toContain('verified archive reached extraction')
  expect(attempts).toHaveLength(3)
  expect(delays).toEqual([2, 4])
})

downloadTest('fails preparation clearly after exhausting retries and removes partial downloads', () => {
  const { result, attempts, delays, directory } = prepare('always')
  expect(result.status).not.toBe(0)
  expect(result.stderr).toContain('Download failed after 4 attempts')
  expect(result.stderr).toContain('simulated network failure')
  expect(attempts).toHaveLength(4)
  expect(delays).toEqual([2, 4, 8])
  expect(existsSync(join(directory, 'sdk.zip'))).toBe(false)
  expect(existsSync(join(directory, 'sdk.zip.partial'))).toBe(false)
})

downloadTest('rejects a successful but truncated response before extraction', () => {
  const { result, attempts, directory } = prepare('wrong')
  expect(result.status).not.toBe(0)
  expect(result.stderr).toContain('SHA-256 mismatch')
  expect(attempts).toHaveLength(4)
  expect(result.stdout).not.toContain('verified archive reached extraction')
  expect(existsSync(join(directory, 'sdk.zip'))).toBe(false)
})

downloadTest('uses a verified cache entry without downloading', () => {
  const { result, attempts } = prepare('always', 'verified package bytes')
  expect(result.status, result.stderr).toBe(0)
  expect(result.stdout).toContain('verified archive reached extraction')
  expect(attempts).toHaveLength(0)
})

downloadTest('replaces a corrupt cache entry before extraction', () => {
  const { result, attempts } = prepare('success', 'corrupt cached bytes')
  expect(result.status, result.stderr).toBe(0)
  expect(result.stdout).toContain('verified archive reached extraction')
  expect(attempts).toHaveLength(1)
})


downloadTest.each([
  ['x64', 'sdk'], ['x64', 'cppwinrt'], ['x64', 'runtime-x64'], ['arm64', 'runtime-arm64'],
])('retries %s %s on the preparation path through installer output', (architecture, artifact) => {
  const { result, attempts, delays } = prepare('transient', undefined, architecture, artifact, true)
  expect(result.status, result.stderr).toBe(0)
  expect(result.stdout).toContain('verified installer reached output')
  expect(attempts).toHaveLength(3)
  expect(delays).toEqual([2, 4])
})

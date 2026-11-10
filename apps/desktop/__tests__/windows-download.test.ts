import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, expect, it } from 'vitest'

const native = fileURLToPath(new URL('../src-tauri/native/windows', import.meta.url))
const shell = process.platform === 'win32' ? 'powershell.exe' : 'pwsh'
const available = process.platform === 'win32' || spawnSync(shell, ['-NoProfile', '-Command', 'exit 0']).status === 0
/** WHY: Windows CI uses the build's PowerShell host; other hosts run these cases when pwsh is installed. */
const downloadTest = it.skipIf(!available)
if (!available) process.stderr.write(`PowerShell download tests skipped: ${shell} is unavailable\n`)

/** WHY: One PowerShell start took 0.34 to 2.4 s per case on healthy Windows runners and 20.6 to 22.4 s on a slow runner, so one process runs every case; 120 s is about five times the slowest start. */
const batchTimeoutMilliseconds = 120_000

interface Scenario { mode: string; cached?: string; architecture?: string; artifact?: string; complete?: boolean; signature?: string; url?: string }
interface Outcome { status: number; stdout: string; stderr: string; directory: string; attempts: number[]; delays: number[] }

const installerScenarios = [['x64', 'sdk'], ['x64', 'cppwinrt'], ['x64', 'runtime-x64'], ['arm64', 'runtime-arm64']] as const
const signers = ['microsoft', 'non-microsoft', 'unsigned'] as const
const scenarios: Record<string, Scenario> = {
  transient: { mode: 'transient' },
  exhausted: { mode: 'always' },
  truncated: { mode: 'wrong' },
  cached: { mode: 'always', cached: 'verified package bytes' },
  corrupt: { mode: 'success', cached: 'corrupt cached bytes' },
  foreignHost: { mode: 'success', url: 'https://example.com/sdk.zip' },
  ...Object.fromEntries(installerScenarios.map(([architecture, artifact]) => [
    `installer ${architecture} ${artifact}`, { mode: 'transient', architecture, artifact, complete: true },
  ])),
  ...Object.fromEntries(signers.map(signature => [`signer ${signature}`, { mode: 'success', complete: true, signature }])),
}

const batchScript = `
$ErrorActionPreference = 'Stop'
$script:attempts = 0
$caseComplete = 'case-complete'
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
    if ($env:TEST_COMPLETE -ne 'true') { throw $caseComplete }
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
function Copy-Item {
    param($Path, $Destination, [switch]$Force)
    if ([System.IO.File]::ReadAllText($Path) -ne 'verified package bytes') { throw 'Unverified installer reached output' }
    Microsoft.PowerShell.Management\\Copy-Item $Path $Destination -Force
    Write-Output 'verified installer reached output'
}
function Get-FileHash {
    param($Path, $Algorithm)
    $content = [System.IO.File]::ReadAllText($Path)
    if ($content -ne 'verified package bytes') { return @{ Hash = 'wrong' } }
    $pins = Get-Content (Join-Path $env:TEST_ROOT 'downloads.json') -Raw | ConvertFrom-Json
    $name = [System.IO.Path]::GetFileName($Path) -replace '\\.zip(\\.partial)?$', '' -replace '\\.exe(\\.partial)?$', ''
    return @{ Hash = $pins.$name.sha256 }
}
function Get-AuthenticodeSignature {
    param($FilePath)
    Add-Content (Join-Path $env:TEST_ROOT 'signatures') $FilePath
    $status = if ($env:TEST_SIGNATURE -eq 'unsigned') { 'NotSigned' } else { 'Valid' }
    $subject = if ($env:TEST_SIGNATURE -eq 'non-microsoft') { 'O=Another Corporation,' } else { 'O=Microsoft Corporation,' }
    return @{ Status = $status; SignerCertificate = @{ Subject = $subject } }
}
foreach ($case in (Get-Content $env:TEST_MANIFEST -Raw | ConvertFrom-Json)) {
    $env:TEST_ROOT = $case.directory
    $env:TEST_MODE = $case.mode
    $env:TEST_ARCHITECTURE = $case.architecture
    $env:TEST_ARTIFACT = $case.artifact
    $env:TEST_COMPLETE = [string]$case.complete
    $env:TEST_SIGNATURE = $case.signature
    $env:TEST_URL = $case.url
    $env:ORBIT_WINDOWS_DOWNLOAD_CACHE = $case.directory
    $script:attempts = 0
    $script:status = 0
    $script:failure = ''
    Set-Alias -Name (Join-Path $env:TEST_ROOT 'cppwinrt/bin/cppwinrt.exe') -Value Invoke-Projection
    $records = & {
        try {
            if ($env:TEST_URL) {
                . (Join-Path $env:TEST_ROOT 'download.ps1')
                Get-VerifiedDownload $env:TEST_URL (Join-Path $env:TEST_ROOT 'sdk.zip') 'unused'
            } else {
                & (Join-Path $env:TEST_ROOT 'prepare.ps1') -Architecture $env:TEST_ARCHITECTURE -Output $env:TEST_ROOT
            }
        } catch {
            if ($_.Exception.Message -ne $caseComplete) {
                $script:status = 1
                $script:failure = $_.Exception.Message
            }
        }
    } *>&1
    $stdout = (@($records | Where-Object { $_ -is [string] }) -join [Environment]::NewLine)
    $stderr = (@($records | Where-Object { $_ -isnot [string] } | ForEach-Object { $_.ToString() }) + $script:failure) -join [Environment]::NewLine
    [System.IO.File]::WriteAllText((Join-Path $case.directory 'result.json'), (@{ status = $script:status; stdout = $stdout; stderr = $stderr } | ConvertTo-Json -Compress))
}
`

const directories: string[] = []
afterAll(() => directories.splice(0).forEach(directory => rmSync(directory, { recursive: true, force: true })))

function stage(scenario: Scenario) {
  const directory = mkdtempSync(join(tmpdir(), 'orbit-windows-download-'))
  directories.push(directory)
  for (const filename of readdirSync(native).filter(filename => filename.endsWith('.ps1') || filename.endsWith('.json'))) {
    copyFileSync(join(native, filename), join(directory, filename))
  }
  if (scenario.cached !== undefined) writeFileSync(join(directory, 'sdk.zip'), scenario.cached)
  return {
    directory, mode: scenario.mode, architecture: scenario.architecture ?? 'x64', artifact: scenario.artifact ?? 'sdk',
    complete: scenario.complete ?? false, signature: scenario.signature ?? 'microsoft', url: scenario.url ?? '',
  }
}

function runScenarios(): Record<string, Outcome> {
  const staged = Object.entries(scenarios).map(([name, scenario]) => [name, stage(scenario)] as const)
  const batch = mkdtempSync(join(tmpdir(), 'orbit-windows-download-batch-'))
  directories.push(batch)
  const manifest = join(batch, 'manifest.json')
  const harness = join(batch, 'batch.ps1')
  writeFileSync(manifest, JSON.stringify(staged.map(([, entry]) => entry)))
  writeFileSync(harness, batchScript)
  const result = spawnSync(shell, ['-NoProfile', '-File', harness], {
    encoding: 'utf8', timeout: batchTimeoutMilliseconds, env: { ...process.env, TEST_MANIFEST: manifest },
  })
  if (result.status !== 0) throw new Error(`PowerShell batch exited with ${String(result.status)}: ${result.stdout}${result.stderr}${String(result.error)}`)
  return Object.fromEntries(staged.map(([name, entry]) => {
    const lines = (file: string) => existsSync(join(entry.directory, file)) ? readFileSync(join(entry.directory, file), 'utf8').trim().split(/\r?\n/).map(Number) : []
    const recorded = JSON.parse(readFileSync(join(entry.directory, 'result.json'), 'utf8')) as Pick<Outcome, 'status' | 'stdout' | 'stderr'>
    return [name, { ...recorded, directory: entry.directory, attempts: lines('attempts'), delays: lines('delays') }]
  }))
}

let outcomes: Record<string, Outcome> = {}
if (available) beforeAll(() => { outcomes = runScenarios() }, batchTimeoutMilliseconds + 10_000)
const outcome = (name: string) => outcomes[name]!

downloadTest('prepares the SDK after two network failures with bounded backoff', () => {
  const { status, stderr, stdout, attempts, delays } = outcome('transient')
  expect(status, stderr).toBe(0)
  expect(stdout).toContain('verified archive reached extraction')
  expect(attempts).toHaveLength(3)
  expect(delays).toEqual([2, 4])
})

downloadTest('fails preparation clearly after exhausting retries and removes partial downloads', () => {
  const { status, stderr, attempts, delays, directory } = outcome('exhausted')
  expect(status).not.toBe(0)
  expect(stderr).toContain('Download failed after 4 attempts')
  expect(stderr).toContain('simulated network failure')
  expect(attempts).toHaveLength(4)
  expect(delays).toEqual([2, 4, 8])
  expect(existsSync(join(directory, 'sdk.zip'))).toBe(false)
  expect(existsSync(join(directory, 'sdk.zip.partial'))).toBe(false)
})

downloadTest('rejects a successful but truncated response before extraction', () => {
  const { status, stderr, stdout, attempts, directory } = outcome('truncated')
  expect(status).not.toBe(0)
  expect(stderr).toContain('SHA-256 mismatch')
  expect(attempts).toHaveLength(4)
  expect(stdout).not.toContain('verified archive reached extraction')
  expect(existsSync(join(directory, 'sdk.zip'))).toBe(false)
})

downloadTest('uses a verified cache entry without downloading', () => {
  const { status, stderr, stdout, attempts } = outcome('cached')
  expect(status, stderr).toBe(0)
  expect(stdout).toContain('verified archive reached extraction')
  expect(attempts).toHaveLength(0)
})

downloadTest('replaces a corrupt cache entry before extraction', () => {
  const { status, stderr, stdout, attempts } = outcome('corrupt')
  expect(status, stderr).toBe(0)
  expect(stdout).toContain('verified archive reached extraction')
  expect(attempts).toHaveLength(1)
})

downloadTest.each(installerScenarios)('retries %s %s on the preparation path through installer output', (architecture, artifact) => {
  const { status, stderr, stdout, attempts, delays } = outcome(`installer ${architecture} ${artifact}`)
  expect(status, stderr).toBe(0)
  expect(stdout).toContain('verified installer reached output')
  expect(attempts).toHaveLength(3)
  expect(delays).toEqual([2, 4])
})

it('keeps every real Windows download pin as a fixed SHA-256 literal', () => {
  const pins = JSON.parse(readFileSync(join(native, 'downloads.json'), 'utf8')) as Record<string, { url: string; sha256: string }>
  expect(Object.keys(pins).sort((left, right) => left.localeCompare(right))).toEqual(['cppwinrt', 'runtime-arm64', 'runtime-x64', 'sdk'])
  for (const pin of Object.values(pins)) expect(pin.sha256).toMatch(/^[a-f0-9]{64}$/)
})

downloadTest.each(signers)('runs Authenticode admission for a %s signer', (signature) => {
  const { status, stderr, directory } = outcome(`signer ${signature}`)
  expect(existsSync(join(directory, 'signatures'))).toBe(true)
  if (signature === 'microsoft') {
    expect(status, stderr).toBe(0)
    expect(readFileSync(join(directory, 'signatures'), 'utf8').trim().split(/\r?\n/)).toHaveLength(2)
  } else {
    expect(status).not.toBe(0)
    expect(stderr).toContain('Windows App SDK signature verification failed')
  }
})

downloadTest('refuses foreign download hosts before making a request', () => {
  const { status, stderr, attempts } = outcome('foreignHost')
  expect(status).not.toBe(0)
  expect(stderr).toContain('download host is not allowed')
  expect(attempts).toHaveLength(0)
})

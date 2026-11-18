import { spawnSync } from 'node:child_process'
import { win32 } from 'node:path'

export const WINDOWS_STL_MINIMUM_CLANG_MAJOR = 22

export type CompilerProbe = (command: string, args: string[]) => { stdout: string; status: number | null }

export interface CompilerCandidate {
  command: string
  major: number
}

const probeProcess: CompilerProbe = (command, args) => {
  const result = spawnSync(command, args, { encoding: 'utf8', timeout: 30000 })
  return { stdout: result.stdout, status: result.status }
}

export function parseClangMajor(versionOutput: string): number | undefined {
  const match = /clang version (\d+)\./.exec(versionOutput)
  return match ? Number(match[1]) : undefined
}

function readVisualStudioClang(probe: CompilerProbe, programFilesX86: string): string[] {
  const vswhere = win32.join(programFilesX86, 'Microsoft Visual Studio', 'Installer', 'vswhere.exe')
  const found = probe(vswhere, ['-latest', '-products', '*', '-property', 'installationPath'])
  const installation = found.status === 0 ? found.stdout.trim().split(/\r?\n/)[0] : ''
  if (!installation) return []
  const architecture = process.arch === 'arm64' ? 'ARM64' : 'x64'
  return [win32.join(installation, 'VC', 'Tools', 'Llvm', architecture, 'bin', 'clang++.exe')]
}

export function listCompilerCandidates(probe: CompilerProbe, programFilesX86: string): CompilerCandidate[] {
  const commands = ['clang++', ...readVisualStudioClang(probe, programFilesX86)]
  return commands.flatMap(command => {
    const version = probe(command, ['--version'])
    const major = version.status === 0 ? parseClangMajor(version.stdout) : undefined
    return major === undefined ? [] : [{ command, major }]
  })
}

/**
 * Windows runner images hold a standalone LLVM on PATH and a Clang inside Visual Studio. The MSVC STL refuses a Clang older than
 * its own minimum (STL1000), so the newest candidate wins. Other platforms use the Clang on PATH.
 */
export function resolveCppCompiler(
  platform: NodeJS.Platform = process.platform,
  probe: CompilerProbe = probeProcess,
  programFilesX86: string = process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)',
): string {
  if (platform !== 'win32') return 'clang++'
  const candidates = listCompilerCandidates(probe, programFilesX86)
  const newest = candidates.reduce<CompilerCandidate | undefined>((best, candidate) => (best && best.major >= candidate.major ? best : candidate), undefined)
  if (!newest || newest.major < WINDOWS_STL_MINIMUM_CLANG_MAJOR) {
    const seen = candidates.map(candidate => `${candidate.command} (Clang ${candidate.major})`).join(', ') || 'none'
    throw new Error(`No Clang ${WINDOWS_STL_MINIMUM_CLANG_MAJOR} or newer for the installed MSVC STL. Found: ${seen}.`)
  }
  return newest.command
}

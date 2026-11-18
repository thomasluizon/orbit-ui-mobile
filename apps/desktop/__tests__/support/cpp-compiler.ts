import { spawnSync } from 'node:child_process'
import { win32 } from 'node:path'

export type CompilerProbe = (command: string, args: string[]) => { stdout: string; status: number | null }

interface CompilerCandidate {
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

function listCompilerCandidates(probe: CompilerProbe, programFilesX86: string): CompilerCandidate[] {
  const commands = ['clang++', ...readVisualStudioClang(probe, programFilesX86)]
  return commands.flatMap(command => {
    const version = probe(command, ['--version'])
    const major = version.status === 0 ? parseClangMajor(version.stdout) : undefined
    return major === undefined ? [] : [{ command, major }]
  })
}

/**
 * Windows runner images hold a standalone LLVM on PATH and a Clang inside Visual Studio. The newest candidate wins. The MSVC STL
 * owns its Clang minimum and reports it at compile time (STL1000), so no floor is copied here. Other platforms use the Clang on PATH.
 */
export function resolveCppCompiler(
  platform: NodeJS.Platform = process.platform,
  probe: CompilerProbe = probeProcess,
  programFilesX86: string = process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)',
): string {
  if (platform !== 'win32') return 'clang++'
  const candidates = listCompilerCandidates(probe, programFilesX86)
  const newest = candidates.reduce<CompilerCandidate | undefined>((best, candidate) => (best && best.major >= candidate.major ? best : candidate), undefined)
  if (!newest) throw new Error('No Clang found on PATH or in Visual Studio.')
  return newest.command
}

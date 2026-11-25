import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseClangMajor, resolveCppCompiler, runNative, type CompilerProbe } from './support/cpp-compiler.ts'

const visualStudioClang = 'C:\\Program Files\\Microsoft Visual Studio\\18\\Enterprise\\VC\\Tools\\Llvm\\x64\\bin\\clang++.exe'
const vswhere = 'C:\\Program Files (x86)\\Microsoft Visual Studio\\Installer\\vswhere.exe'

function runnerProbe(pathClang: string | null, visualStudioVersion: string | null, visualStudioClangPath: string = visualStudioClang): CompilerProbe {
  return (command, args) => {
    if (command === vswhere) return visualStudioVersion ? { stdout: 'C:\\Program Files\\Microsoft Visual Studio\\18\\Enterprise\r\n', status: 0 } : { stdout: '', status: 0 }
    if (args[0] !== '--version') throw new Error(`Unexpected probe: ${command} ${args.join(' ')}`)
    const output = command === 'clang++' ? pathClang : command === visualStudioClangPath ? visualStudioVersion : null
    return output ? { stdout: `clang version ${output} (https://github.com/llvm/llvm-project)\nTarget: x86_64-pc-windows-msvc\n`, status: 0 } : { stdout: '', status: 1 }
  }
}

const resolveOnWindows = (probe: CompilerProbe, architecture: NodeJS.Architecture = 'x64') => resolveCppCompiler('win32', probe, architecture, 'C:\\Program Files (x86)')

describe('parseClangMajor', () => {
  it('reads the major version from the first line of the version output', () => {
    expect(parseClangMajor('clang version 22.1.3 (https://github.com/llvm/llvm-project abc)\nTarget: x86_64')).toBe(22)
    expect(parseClangMajor('Apple clang version 17.0.0 (clang-1700.0.13.5)')).toBe(17)
    expect(parseClangMajor('not a compiler')).toBeUndefined()
  })
})

describe('resolveCppCompiler', () => {
  it('keeps the Clang on PATH outside Windows without probing', () => {
    const probe: CompilerProbe = () => {
      throw new Error('probed')
    }
    expect(resolveCppCompiler('darwin', probe)).toBe('clang++')
    expect(resolveCppCompiler('linux', probe)).toBe('clang++')
  })

  it('picks the Visual Studio Clang when it is newer than the Clang on PATH', () => {
    expect(resolveOnWindows(runnerProbe('20.1.8', '22.1.3'))).toBe(visualStudioClang)
  })

  it.each([
    ['x64', 'C:\\Program Files\\Microsoft Visual Studio\\18\\Enterprise\\VC\\Tools\\Llvm\\x64\\bin\\clang++.exe'],
    ['arm64', 'C:\\Program Files\\Microsoft Visual Studio\\18\\Enterprise\\VC\\Tools\\Llvm\\ARM64\\bin\\clang++.exe'],
  ] as const)('reads the Visual Studio Clang of the %s host from its own folder', (architecture, expectedPath) => {
    expect(resolveOnWindows(runnerProbe('20.1.8', '22.1.3', expectedPath), architecture)).toBe(expectedPath)
  })

  it('keeps the Clang on PATH when it is the newest', () => {
    expect(resolveOnWindows(runnerProbe('22.1.3', '20.1.8'))).toBe('clang++')
  })

  it('returns the newest Clang even when it is old, so the STL reports its own minimum at compile time', () => {
    expect(resolveOnWindows(runnerProbe('18.1.8', '20.1.8'))).toBe(visualStudioClang)
    expect(resolveOnWindows(runnerProbe('20.1.8', null))).toBe('clang++')
  })

  it('fails when no Clang is installed, and never hides the missing compiler', () => {
    expect(() => resolveOnWindows(runnerProbe(null, null))).toThrow('No Clang found on PATH or in Visual Studio.')
  })
})

describe('runNative', () => {
  const lingering = "require('node:child_process').spawn(process.execPath, ['-e', 'setTimeout(() => {}, 4000)'], { stdio: 'inherit' }).unref(); console.log('compiled')"

  it('returns when the tool exits, even while a helper it started still holds the output open', () => {
    const directory = mkdtempSync(join(tmpdir(), 'orbit-native-run-'))
    try {
      const start = Date.now()
      const run = runNative(process.execPath, ['-e', lingering], directory)
      expect(Date.now() - start).toBeLessThan(2500)
      expect(run.error).toBeUndefined()
      expect(run.status).toBe(0)
      expect(run.output).toContain('compiled')
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('reports the exit status and the output of a failed tool', () => {
    const directory = mkdtempSync(join(tmpdir(), 'orbit-native-run-'))
    try {
      const run = runNative(process.execPath, ['-e', "console.error('boom'); process.exit(3)"], directory)
      expect(run.status).toBe(3)
      expect(run.output).toContain('boom')
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })
})

import { describe, expect, it } from 'vitest'
import { parseClangMajor, resolveCppCompiler, type CompilerProbe } from './support/cpp-compiler.ts'

const hostFolder = process.arch === 'arm64' ? 'ARM64' : 'x64'
const visualStudioClang = `C:\\Program Files\\Microsoft Visual Studio\\18\\Enterprise\\VC\\Tools\\Llvm\\${hostFolder}\\bin\\clang++.exe`
const vswhere = 'C:\\Program Files (x86)\\Microsoft Visual Studio\\Installer\\vswhere.exe'

function runnerProbe(pathClang: string | null, visualStudioVersion: string | null): CompilerProbe {
  return (command, args) => {
    if (command === vswhere) return visualStudioVersion ? { stdout: 'C:\\Program Files\\Microsoft Visual Studio\\18\\Enterprise\r\n', status: 0 } : { stdout: '', status: 0 }
    if (args[0] !== '--version') throw new Error(`Unexpected probe: ${command} ${args.join(' ')}`)
    const output = command === 'clang++' ? pathClang : command === visualStudioClang ? visualStudioVersion : null
    return output ? { stdout: `clang version ${output} (https://github.com/llvm/llvm-project)\nTarget: x86_64-pc-windows-msvc\n`, status: 0 } : { stdout: '', status: 1 }
  }
}

const resolveOnWindows = (probe: CompilerProbe) => resolveCppCompiler('win32', probe, 'C:\\Program Files (x86)')

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

  it('picks the Visual Studio Clang when the LLVM on PATH is older than the STL accepts', () => {
    expect(resolveOnWindows(runnerProbe('20.1.8', '22.1.3'))).toBe(visualStudioClang)
  })

  it('keeps the Clang on PATH when it is the newest and new enough', () => {
    expect(resolveOnWindows(runnerProbe('22.1.3', '20.1.8'))).toBe('clang++')
  })

  it('works when Visual Studio is not installed and the Clang on PATH is new enough', () => {
    expect(resolveOnWindows(runnerProbe('22.1.3', null))).toBe('clang++')
  })

  it('fails with the versions it found when no Clang is new enough, and never hides the mismatch', () => {
    expect(() => resolveOnWindows(runnerProbe('20.1.8', '20.1.8'))).toThrow(
      `No Clang 22 or newer for the installed MSVC STL. Found: clang++ (Clang 20), ${visualStudioClang} (Clang 20).`,
    )
    expect(() => resolveOnWindows(runnerProbe(null, null))).toThrow('Found: none.')
  })
})

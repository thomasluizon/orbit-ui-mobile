import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import { resolveCppCompiler, runNative } from './support/cpp-compiler.ts'

it('replaces an expired WNS channel in the retained process and returns its new endpoint on subsequent requests', () => {
  const directory = mkdtempSync(join(tmpdir(), 'orbit-channel-'))
  try {
    const executable = join(directory, process.platform === 'win32' ? 'channel.exe' : 'channel')
    const compiled = runNative(resolveCppCompiler(), ['-std=c++20', fileURLToPath(new URL('./native-channel.cpp', import.meta.url)), '-o', executable], directory)
    expect(compiled.error, compiled.output).toBeUndefined()
    expect(compiled.status, compiled.output).toBe(0)
    const result = runNative(executable, [], directory)
    expect(result.error, result.output).toBeUndefined()
    expect(result.status, result.output).toBe(0)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}, 120_000)

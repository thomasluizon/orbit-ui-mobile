import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'

it('replaces an expired WNS channel in the retained process and returns its new endpoint on subsequent requests', () => {
  const directory = mkdtempSync(join(tmpdir(), 'orbit-channel-'))
  try {
    const executable = join(directory, process.platform === 'win32' ? 'channel.exe' : 'channel')
    const compiled = spawnSync('clang++', ['-std=c++20', fileURLToPath(new URL('./native-channel.cpp', import.meta.url)), '-o', executable], { encoding: 'utf8' })
    expect(compiled.error, compiled.stderr).toBeUndefined()
    expect(compiled.status, compiled.stderr).toBe(0)
    const result = spawnSync(executable, [], { encoding: 'utf8' })
    expect(result.error, result.stderr).toBeUndefined()
    expect(result.status, result.stderr).toBe(0)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}, 120_000)

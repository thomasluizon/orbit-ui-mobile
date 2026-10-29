import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'

it.skipIf(process.platform !== 'darwin')('registers localized background Done actions and routes native body, Done and dismiss callbacks', () => {
  const directory = mkdtempSync(join(tmpdir(), 'orbit-notification-'))
  try {
    const executable = join(directory, 'notification')
    const compiled = spawnSync('clang', ['-fobjc-arc', '-fblocks', '-framework', 'AppKit', '-framework', 'UserNotifications', '-framework', 'Security', fileURLToPath(new URL('./native-notification.m', import.meta.url)), '-o', executable], { encoding: 'utf8' })
    expect(compiled.error, compiled.stderr).toBeUndefined()
    expect(compiled.status, compiled.stderr).toBe(0)
    const result = spawnSync(executable, [], { encoding: 'utf8' })
    expect(result.error, result.stderr).toBeUndefined()
    expect(result.status, result.stderr).toBe(0)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}, 120_000)

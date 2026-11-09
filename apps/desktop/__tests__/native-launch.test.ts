import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'

it.each([
  ['macos/launch.m', 'MIN(128, MIN(NSWidth(self.bounds), NSHeight(self.bounds)))'],
  ['windows/launch.cpp', 'MulDiv(128, GetDpiForWindow(window), 96)'],
])('draws the granted mark at 128 logical pixels in %s', (path, sizing) => {
  const source = readFileSync(new URL(`../src-tauri/native/${path}`, import.meta.url), 'utf8')
  expect(source.includes(sizing)).toBe(true)
})

it.skipIf(process.platform !== 'darwin')('presents the native mark before display, resizes, releases on paint or timeout and returns on reload', () => {
  const directory = mkdtempSync(join(tmpdir(), 'orbit-launch-'))
  try {
    const executable = join(directory, 'launch')
    const compiled = spawnSync('clang', ['-fobjc-arc', '-framework', 'AppKit', fileURLToPath(new URL('./native-launch.m', import.meta.url)), '-o', executable], { encoding: 'utf8' })
    expect(compiled.error, compiled.stderr).toBeUndefined()
    expect(compiled.status, compiled.stderr).toBe(0)
    const assets = ['dark', 'light'].map(mode => fileURLToPath(new URL(`../src-tauri/native/launch-${mode}.png`, import.meta.url)))
    const result = spawnSync(executable, assets, { encoding: 'utf8' })
    expect(result.error, result.stderr).toBeUndefined()
    expect(result.status, result.stderr).toBe(0)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}, 120_000)

it.skipIf(process.platform !== 'win32')('keeps the centered Windows mark above host and webview repaints from hidden creation through reload and resize', () => {
  const directory = mkdtempSync(join(tmpdir(), 'orbit-launch-'))
  try {
    const executable = join(directory, 'launch.exe')
    const compiled = spawnSync('clang++', ['-std=c++20', fileURLToPath(new URL('./native-launch.cpp', import.meta.url)), '-o', executable,
      '-lgdiplus', '-lshlwapi', '-lcomctl32', '-lgdi32', '-ladvapi32', '-luser32', '-ldwmapi'], { encoding: 'utf8' })
    expect(compiled.error, compiled.stderr).toBeUndefined()
    expect(compiled.status, compiled.stderr).toBe(0)
    for (const mode of ['dark', 'light']) {
      const asset = fileURLToPath(new URL(`../src-tauri/native/launch-${mode}.png`, import.meta.url))
      const result = spawnSync(executable, [asset, mode], { encoding: 'utf8' })
      expect(result.error, result.stderr).toBeUndefined()
      expect(result.status, result.stderr).toBe(0)
    }
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}, 120_000)

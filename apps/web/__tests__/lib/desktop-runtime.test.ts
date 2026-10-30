import { afterEach, expect, it, vi } from 'vitest'
import { desktopCommandSupported, desktopRuntime, isDesktopPush } from '@/lib/desktop-runtime'

afterEach(() => vi.unstubAllGlobals())

it('keeps native discovery inert during server rendering', () => {
  vi.stubGlobal('window', undefined)
  expect(desktopRuntime()).toBeUndefined()
  expect(isDesktopPush()).toBe(false)
  expect(desktopCommandSupported('desktop_push')).toBe(false)
})

it('requires a native runtime before trusting advertised commands', () => {
  vi.stubGlobal('__TAURI_INTERNALS__', undefined)
  vi.stubGlobal('__ORBIT_DESKTOP_COMMANDS__', ['desktop_push'])
  expect(desktopRuntime()).toBeUndefined()
  expect(isDesktopPush()).toBe(false)
  expect(desktopCommandSupported('desktop_push')).toBe(false)
})

it('returns the discovered runtime and admits only explicitly advertised commands', () => {
  const runtime = { invoke: vi.fn() }
  vi.stubGlobal('__TAURI_INTERNALS__', runtime)
  vi.stubGlobal('__ORBIT_DESKTOP_COMMANDS__', ['desktop_push'])
  expect(desktopRuntime()).toBe(runtime)
  expect(isDesktopPush()).toBe(true)
  expect(desktopCommandSupported('desktop_push')).toBe(true)
  expect(desktopCommandSupported('desktop_update')).toBe(false)
})

it.each([undefined, null, 'desktop_push', { desktop_push: true }, []].map(commands => ({ commands })))(
  'rejects absent or malformed command advertisements: $commands', ({ commands }) => {
    vi.stubGlobal('__TAURI_INTERNALS__', { invoke: vi.fn() })
    vi.stubGlobal('__ORBIT_DESKTOP_COMMANDS__', commands)
    expect(desktopCommandSupported('desktop_push')).toBe(false)
  },
)

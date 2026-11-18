import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SIDEBAR_COLLAPSED_COOKIE } from '@/lib/sidebar-preference'

function clearCookie() {
  document.cookie = `${SIDEBAR_COLLAPSED_COOKIE}=; path=/; max-age=0`
}

async function loadShellStore() {
  vi.resetModules()
  return (await import('@/stores/shell-store')).useShellStore
}

describe('sidebar preference cookie', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    clearCookie()
  })

  it('writes the preference to a one-year cookie the server can read', async () => {
    const useShellStore = await loadShellStore()
    const writes: string[] = []
    vi.spyOn(document, 'cookie', 'set').mockImplementation((value) => { writes.push(value) })
    useShellStore.getState().toggleSidebar()
    useShellStore.getState().setPaletteOpen(true)
    useShellStore.getState().setLastDestination('perfil')
    expect(writes).toEqual([`${SIDEBAR_COLLAPSED_COOKIE}=1; path=/; max-age=31536000; SameSite=Strict; Secure`])
    useShellStore.getState().toggleSidebar()
    expect(writes.at(-1)).toBe(`${SIDEBAR_COLLAPSED_COOKIE}=0; path=/; max-age=31536000; SameSite=Strict; Secure`)
    expect(useShellStore.getState().sidebarCollapsed).toBe(false)
  })

  it('creates the store with the saved preference and keeps the other state at its default', async () => {
    document.cookie = `${SIDEBAR_COLLAPSED_COOKIE}=1; path=/`
    const useShellStore = await loadShellStore()
    expect(useShellStore.getState()).toMatchObject({ sidebarCollapsed: true, paletteOpen: false, lastDestination: 'hoje' })
  })

  it.each(['0', '', 'true', 'yes'])('treats the cookie value "%s" as expanded', async (value) => {
    document.cookie = `${SIDEBAR_COLLAPSED_COOKIE}=${value}; path=/`
    const useShellStore = await loadShellStore()
    expect(useShellStore.getState().sidebarCollapsed).toBe(false)
  })

  it('starts expanded with no cookie and toggles in memory', async () => {
    const useShellStore = await loadShellStore()
    expect(useShellStore.getState().sidebarCollapsed).toBe(false)
    useShellStore.getState().toggleSidebar()
    expect(useShellStore.getState().sidebarCollapsed).toBe(true)
  })

  describe('migration of the old localStorage preference', () => {
    const legacyKey = 'orbit-shell-store'
    const legacyValue = (sidebarCollapsed: unknown) => JSON.stringify({ state: { sidebarCollapsed }, version: 1 })

    beforeEach(() => { localStorage.clear() })

    it.each([
      { name: 'old key true', cookie: undefined, stored: legacyValue(true), collapsed: true, cookieWrite: '1' },
      { name: 'old key false', cookie: undefined, stored: legacyValue(false), collapsed: false, cookieWrite: '0' },
      { name: 'old key not a boolean', cookie: undefined, stored: legacyValue('yes'), collapsed: false, cookieWrite: undefined },
      { name: 'malformed JSON', cookie: undefined, stored: '{not json', collapsed: false, cookieWrite: undefined },
      { name: 'no key', cookie: undefined, stored: null, collapsed: false, cookieWrite: undefined },
      { name: 'cookie 0 wins over old key true', cookie: '0', stored: legacyValue(true), collapsed: false, cookieWrite: undefined },
      { name: 'cookie 1 wins over old key false', cookie: '1', stored: legacyValue(false), collapsed: true, cookieWrite: undefined },
    ])('$name gives $collapsed', async ({ cookie, stored, collapsed, cookieWrite }) => {
      if (cookie !== undefined) document.cookie = `${SIDEBAR_COLLAPSED_COOKIE}=${cookie}; path=/`
      if (stored !== null) localStorage.setItem(legacyKey, stored)
      const writes: string[] = []
      vi.spyOn(document, 'cookie', 'set').mockImplementation((value) => { writes.push(value) })
      const useShellStore = await loadShellStore()
      expect(useShellStore.getState().sidebarCollapsed).toBe(collapsed)
      expect(writes).toEqual(cookieWrite === undefined ? [] : [`${SIDEBAR_COLLAPSED_COOKIE}=${cookieWrite}; path=/; max-age=31536000; SameSite=Strict; Secure`])
      if (cookie === undefined) expect(localStorage.getItem(legacyKey)).toBeNull()
    })
  })
})

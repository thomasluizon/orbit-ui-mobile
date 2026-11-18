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
})

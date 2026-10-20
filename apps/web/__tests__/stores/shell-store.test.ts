import { captureException } from '@sentry/nextjs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useShellStore } from '@/stores/shell-store'

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }))

describe('sidebar preference storage', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.clearAllMocks()
    localStorage.clear()
    useShellStore.setState(useShellStore.getInitialState())
  })

  it('persists only the sidebar preference in the production storage format', async () => {
    useShellStore.getState().toggleSidebar()
    useShellStore.getState().setPaletteOpen(true)
    useShellStore.getState().setLastDestination('perfil')
    expect(JSON.parse(localStorage.getItem('orbit-shell-store')!)).toEqual({ state: { sidebarCollapsed: true }, version: 1 })
    const saved = localStorage.getItem('orbit-shell-store')!
    useShellStore.setState(useShellStore.getInitialState())
    localStorage.setItem('orbit-shell-store', saved)
    await useShellStore.persist.rehydrate()
    expect(useShellStore.getState()).toMatchObject({ sidebarCollapsed: true, paletteOpen: false, lastDestination: 'hoje' })
  })

  it('reports a blocked storage write and keeps the control usable in memory', () => {
    const error = new DOMException('Storage unavailable', 'QuotaExceededError')
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw error })
    expect(() => useShellStore.getState().toggleSidebar()).not.toThrow()
    expect(useShellStore.getState().sidebarCollapsed).toBe(true)
    useShellStore.getState().toggleSidebar()
    expect(useShellStore.getState().sidebarCollapsed).toBe(false)
    expect(captureException).toHaveBeenCalledWith(error)
  })

  it('reports a blocked storage read and allows a new selection', async () => {
    const error = new DOMException('Storage unavailable', 'SecurityError')
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw error })
    await useShellStore.persist.rehydrate()
    expect(captureException).toHaveBeenCalledWith(error)
    useShellStore.getState().toggleSidebar()
    expect(useShellStore.getState().sidebarCollapsed).toBe(true)
  })

  it('reports malformed JSON and keeps the default state usable', async () => {
    localStorage.setItem('orbit-shell-store', '{')
    await useShellStore.persist.rehydrate()
    expect(captureException).toHaveBeenCalledWith(expect.any(SyntaxError))
    expect(useShellStore.getState().sidebarCollapsed).toBe(false)
    useShellStore.getState().toggleSidebar()
    expect(useShellStore.getState().sidebarCollapsed).toBe(true)
  })

  it('rejects invalid persisted preferences without replacing store actions', async () => {
    localStorage.setItem('orbit-shell-store', JSON.stringify({ version: 1, state: { sidebarCollapsed: 'true', toggleSidebar: null, paletteOpen: true } }))
    await useShellStore.persist.rehydrate()
    expect(useShellStore.getState().sidebarCollapsed).toBe(false)
    expect(useShellStore.getState().paletteOpen).toBe(false)
    expect(useShellStore.getState().toggleSidebar).toBeTypeOf('function')
  })
})

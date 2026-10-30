import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installWebLocks } from '../helpers/web-locks'
import type { DesktopPushRegistration } from '@orbit/shared/types/push-subscription'

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(), subscribe: vi.fn(), unsubscribe: vi.fn(), account: 'account-a' as string | null, generation: 1,
}))
vi.mock('@/stores/auth-store', () => ({ getHeldAccountId: () => mocks.account }))
vi.mock('@/lib/session-epoch', () => ({ getAccountGeneration: () => mocks.generation }))
vi.mock('@/lib/actions/notifications', () => ({ subscribePush: mocks.subscribe, unsubscribePushForCleanup: mocks.unsubscribe }))

import { desktopEndpoint, ensureDesktopPush, loadDesktopPush, releaseDesktopPush, requestDesktopPushPermission, resumeDesktopPush } from '@/lib/desktop-push'

const registration: DesktopPushRegistration = {
  endpoint: 'https://dm3p.notify.windows.com/?token=renewed', p256dh: 'wns', auth: 'wns', apnsTopic: null,
  deviceId: '11111111-1111-4111-8111-111111111111',
}
const saved = { ...registration, endpoint: 'https://dm3p.notify.windows.com/?token=previous' }
let candidate: DesktopPushRegistration
let owner: string | null
let current: DesktopPushRegistration | null
let pending: { owner: string; registration: DesktopPushRegistration; revoke?: boolean }[]

function snapshot() {
  return { supported: true, permission: 'granted', owner, registration: current, candidate, pending }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.account = 'account-a'
  mocks.generation = 1
  candidate = registration
  owner = 'account-a'
  current = saved
  pending = []
  installWebLocks()
  Object.defineProperty(window, '__ORBIT_DESKTOP_COMMANDS__', { configurable: true, value: ['desktop_push'] })
  Object.defineProperty(window, '__TAURI_INTERNALS__', { configurable: true, value: { invoke: mocks.invoke } })
  mocks.subscribe.mockResolvedValue(undefined)
  mocks.unsubscribe.mockResolvedValue(undefined)
  mocks.invoke.mockImplementation(async (_command: string, payload: Record<string, unknown>) => {
    if (payload.action === 'stage') pending.push({ owner: payload.accountId as string, registration: candidate })
    if (payload.action === 'commit') { owner = payload.accountId as string; current = candidate; pending = [] }
    if (payload.action === 'clear') { owner = null; current = null; pending = [] }
    if (payload.action === 'suspend' && owner !== null && payload.accountId === owner) {
      if (current) pending.push({ owner, registration: current, revoke: true })
      owner = null; current = null
    }
    return snapshot()
  })
})
afterEach(() => { Reflect.deleteProperty(window, '__TAURI_INTERNALS__'); Reflect.deleteProperty(window, '__ORBIT_DESKTOP_COMMANDS__'); vi.unstubAllGlobals() })

describe('desktop push through the native bridge', () => {
  it.each([
    ['granted', true, 'granted'], ['denied', true, 'denied'],
    ['default', true, 'denied'], ['unsupported', false, 'unsupported'],
  ])('maps native permission %s to the permission request result', async (permission, supported, expected) => {
    mocks.invoke.mockResolvedValue({ ...snapshot(), permission, supported })
    expect(await requestDesktopPushPermission()).toBe(expected)
    expect(mocks.invoke).toHaveBeenCalledExactlyOnceWith('desktop_push', { action: 'request', prompt: true })
    expect(mocks.subscribe).not.toHaveBeenCalled()
  })

  it('does not prompt when the native command is unavailable', async () => {
    Reflect.deleteProperty(window, '__TAURI_INTERNALS__')
    expect(await requestDesktopPushPermission()).toBe('unsupported')
    expect(mocks.invoke).not.toHaveBeenCalled()
  })

  it('exposes only the held account confirmed endpoint', async () => {
    expect(await desktopEndpoint()).toBe(saved.endpoint)
    owner = 'account-b'
    expect(await desktopEndpoint()).toBeNull()
    owner = 'account-a'; current = null
    expect(await desktopEndpoint()).toBeNull()
    pending = [{ owner: 'account-a', registration }]
    expect(await desktopEndpoint()).toBeNull()
  })

  it('reports invalid native snapshots as sync failure while permission requests reject', async () => {
    mocks.invoke.mockResolvedValue({ ...snapshot(), permission: 'invalid' })
    expect(await loadDesktopPush('account-a')).toEqual({ supported: true, subscribed: false, permission: '', status: 'sync-failed' })
    await expect(requestDesktopPushPermission()).rejects.toThrow()
    await expect(desktopEndpoint()).rejects.toThrow()
  })

  it('ignores a stale resume and releases no account without native work', async () => {
    await resumeDesktopPush('account-b')
    await releaseDesktopPush(null)
    expect(mocks.invoke).not.toHaveBeenCalled()
  })

  it('restores a signed-out session without registering an endpoint', async () => {
    mocks.account = null
    await resumeDesktopPush(null)
    expect(mocks.invoke).toHaveBeenCalledExactlyOnceWith('desktop_push', { action: 'session', accountId: null })
    expect(mocks.subscribe).not.toHaveBeenCalled()
  })

  it('deduplicates uncertain and confirmed endpoints before clearing native ownership', async () => {
    pending = [{ owner: 'account-a', registration: saved }, { owner: 'account-b', registration }]
    await releaseDesktopPush('account-a')
    expect(mocks.unsubscribe).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ endpoint: saved.endpoint }), 'account-a')
    expect(mocks.invoke).toHaveBeenLastCalledWith('desktop_push', { action: 'clear', accountId: 'account-a' })
  })

  it('rejects a queued registration after its account generation changes', async () => {
    const pendingRegistration = ensureDesktopPush()
    mocks.generation++
    await expect(pendingRegistration).rejects.toMatchObject({ code: 'ACCOUNT_CHANGED' })
    expect(mocks.invoke).not.toHaveBeenCalled()
    expect(mocks.subscribe).not.toHaveBeenCalled()
  })

  it('rejects a changed account before staging a native candidate', async () => {
    const native = mocks.invoke.getMockImplementation()!
    mocks.invoke.mockImplementation(async (command, payload) => {
      const result = await native(command, payload)
      if (payload.action === 'request') { mocks.account = 'account-b'; mocks.generation++ }
      return result
    })
    await expect(ensureDesktopPush()).rejects.toMatchObject({ code: 'ACCOUNT_CHANGED' })
    expect(mocks.invoke.mock.calls.map(([, payload]) => payload.action)).toEqual(['session', 'request'])
    expect(mocks.subscribe).not.toHaveBeenCalled()
  })

  it('persists the attempted endpoint before the API write so sign-out can revoke an uncertain renewal', async () => {
    const sequence: string[] = []
    const native = mocks.invoke.getMockImplementation()!
    mocks.invoke.mockImplementation(async (command, payload) => {
      if (payload.action === 'stage' || payload.action === 'commit') sequence.push(payload.action)
      return native(command, payload)
    })
    mocks.subscribe.mockImplementation(async () => { sequence.push('api') })
    await ensureDesktopPush()
    expect(sequence).toEqual(['stage', 'api', 'commit'])
  })

  it('renews the saved device on launch without asking for permission', async () => {
    await resumeDesktopPush('account-a')
    expect(mocks.invoke).toHaveBeenCalledWith('desktop_push', { action: 'request', prompt: false })
    expect(mocks.subscribe).toHaveBeenCalledExactlyOnceWith({
      endpoint: registration.endpoint, keys: { p256dh: 'wns', auth: 'wns' }, apnsTopic: null, deviceId: registration.deviceId,
    }, 'account-a')
    expect(current).toEqual(registration)
    expect((await loadDesktopPush('account-a')).status).toBe('registered')
    expect((await loadDesktopPush('account-b')).subscribed).toBe(false)
  })

  it('carries the account language through the origin checked native session command', async () => {
    await resumeDesktopPush('account-a', 'pt-BR')
    expect(mocks.invoke).toHaveBeenCalledWith('desktop_push', { action: 'session', accountId: 'account-a', language: 'pt-BR' })
  })

  it('commits ownership only after the API accepts registration', async () => {
    const conflict = Object.assign(new Error('Concurrent update'), { code: 'CONCURRENT_UPDATE_CONFLICT' })
    mocks.subscribe.mockRejectedValue(conflict)
    await expect(ensureDesktopPush()).rejects.toBe(conflict)
    expect(mocks.invoke.mock.calls.some(([, payload]) => payload.action === 'commit')).toBe(false)
    expect(current).toBe(saved)
  })

  it('revokes both possible endpoints after the API accepts renewal but native confirmation fails', async () => {
    const native = mocks.invoke.getMockImplementation()!
    mocks.invoke.mockImplementation(async (command, payload) => {
      if (payload.action === 'commit') throw new Error('Cannot save native confirmation')
      return native(command, payload)
    })
    await expect(ensureDesktopPush()).rejects.toThrow('Cannot save native confirmation')
    expect((await loadDesktopPush('account-a')).status).toBe('sync-failed')
    await releaseDesktopPush('account-a')
    expect(mocks.unsubscribe.mock.calls.map(([payload]) => payload.endpoint)).toEqual([registration.endpoint, saved.endpoint])
    expect(pending).toEqual([])
    expect(current).toBeNull()
  })

  it.each([true, false])('pauses the former account when a replacement account owns the session (commands advertised: %s)', async (advertised) => {
    if (!advertised) Reflect.deleteProperty(window, '__ORBIT_DESKTOP_COMMANDS__')
    mocks.account = 'account-b'
    await resumeDesktopPush('account-b')
    expect(mocks.invoke).toHaveBeenCalledWith('desktop_push', { action: 'session', accountId: 'account-b' })
    expect(current).toBeNull()
    expect(mocks.subscribe).not.toHaveBeenCalled()
  })

  it('does not commit a registration after an account changes during the write', async () => {
    mocks.subscribe.mockImplementation(async () => { mocks.account = 'account-b'; mocks.generation++ })
    await expect(ensureDesktopPush()).rejects.toMatchObject({ code: 'ACCOUNT_CHANGED' })
    expect(mocks.invoke.mock.calls.some(([, payload]) => payload.action === 'commit')).toBe(false)
  })

  it.each([true, false])('revokes the API registration before ending the native subscription (commands advertised: %s)', async (advertised) => {
    if (!advertised) Reflect.deleteProperty(window, '__ORBIT_DESKTOP_COMMANDS__')
    const sequence: string[] = []
    mocks.unsubscribe.mockImplementation(async () => { sequence.push('api'); expect(current).toBe(saved) })
    const native = mocks.invoke.getMockImplementation()!
    mocks.invoke.mockImplementation(async (command, payload) => {
      if (payload.action === 'clear') sequence.push('native')
      return native(command, payload)
    })
    await releaseDesktopPush('account-a')
    expect(sequence).toEqual(['api', 'native'])
    expect(mocks.unsubscribe).toHaveBeenCalledWith(expect.objectContaining({ endpoint: saved.endpoint }), 'account-a')
    expect(current).toBeNull()
  })

  it.each([true, false])('drops local delivery on failed revocation and retries the stale endpoint on the next matching sign-in (commands advertised: %s)', async (advertised) => {
    if (!advertised) Reflect.deleteProperty(window, '__ORBIT_DESKTOP_COMMANDS__')
    mocks.unsubscribe.mockRejectedValue(new Error('Offline'))
    await expect(releaseDesktopPush('account-a')).rejects.toThrow('Offline')
    expect(owner).toBeNull()
    expect(current).toBeNull()
    expect(pending).toEqual([{ owner: 'account-a', registration: saved, revoke: true }])
    expect(mocks.invoke.mock.calls.some(([, payload]) => payload.action === 'clear')).toBe(false)
    mocks.unsubscribe.mockResolvedValue(undefined)
    await resumeDesktopPush('account-a')
    expect(mocks.unsubscribe).toHaveBeenCalledTimes(2)
    expect(pending).toEqual([])
    expect(mocks.subscribe).not.toHaveBeenCalled()
  })

  it('does not retry a signed-out account endpoint while a different account restores', async () => {
    pending = [{ owner: 'account-a', registration: saved, revoke: true }]
    owner = null; current = null; mocks.account = 'account-b'
    await resumeDesktopPush('account-b')
    expect(mocks.unsubscribe).not.toHaveBeenCalled()
    expect(mocks.subscribe).not.toHaveBeenCalled()
    expect(pending).toHaveLength(1)
  })

  it('stages and commits the replacement endpoint on a later renewal in the same process', async () => {
    await resumeDesktopPush('account-a')
    mocks.subscribe.mockClear()
    const replacement = { ...registration, endpoint: 'https://dm3p.notify.windows.com/?token=replacement' }
    candidate = replacement
    const native = mocks.invoke.getMockImplementation()!
    const sequence: string[] = []
    mocks.subscribe.mockImplementation(async (payload) => { sequence.push('api'); expect(payload.endpoint).toBe(replacement.endpoint) })
    mocks.invoke.mockImplementation(async (command, payload) => {
      if (payload.action === 'stage' || payload.action === 'commit') sequence.push(payload.action)
      return native(command, payload)
    })
    await resumeDesktopPush('account-a')
    expect(sequence).toEqual(['stage', 'api', 'commit'])
    expect(current).toEqual(replacement)
    expect(pending).toEqual([])
    expect(mocks.invoke).toHaveBeenCalledWith('desktop_push', { action: 'commit', accountId: 'account-a', endpoint: replacement.endpoint })
  })

  it('pauses a timed-out revoke and ignores its late completion', async () => {
    vi.useFakeTimers()
    try {
      let finishRelease: () => void = () => undefined
      mocks.unsubscribe.mockImplementation(() => new Promise<void>((resolve) => { finishRelease = resolve }))
      const released = expect(releaseDesktopPush('account-a')).rejects.toThrow('Push cleanup cancelled')
      await vi.advanceTimersByTimeAsync(5000)
      await released
      expect(owner).toBeNull()
      expect(pending).toEqual([{ owner: 'account-a', registration: saved, revoke: true }])
      finishRelease()
      await vi.advanceTimersByTimeAsync(0)
      expect(mocks.invoke.mock.calls.some(([, payload]) => payload.action === 'clear')).toBe(false)
    } finally { vi.useRealTimers() }
  })

  it('does not revoke another account from a stale sign-out', async () => {
    await releaseDesktopPush('account-b')
    expect(mocks.unsubscribe).not.toHaveBeenCalled()
    expect(current).toBe(saved)
  })

  it.each(['unsupported', 'denied', 'default'])('does not register when native permission is %s', async (permission) => {
    mocks.invoke.mockResolvedValue({ ...snapshot(), supported: permission !== 'unsupported', permission, candidate: null })
    const result = await ensureDesktopPush()
    expect(result.subscribed).toBe(false)
    expect(mocks.subscribe).not.toHaveBeenCalled()
  })
})


it('keeps registration writes inert while retaining access to saved push in older desktop shells', async () => {
  Reflect.deleteProperty(window, '__ORBIT_DESKTOP_COMMANDS__')
  expect(await loadDesktopPush('account-a')).toMatchObject({ subscribed: true, status: 'registered' })
  await resumeDesktopPush('account-a')
  expect(await ensureDesktopPush()).toMatchObject({ supported: false, status: 'unsupported' })
  expect(mocks.invoke.mock.calls.map(([, payload]) => payload.action)).not.toEqual(expect.arrayContaining(['request']))
  expect(mocks.invoke.mock.calls.map(([, payload]) => payload.action)).not.toEqual(expect.arrayContaining(['stage']))
  expect(mocks.invoke.mock.calls.map(([, payload]) => payload.action)).not.toEqual(expect.arrayContaining(['commit']))
  expect(mocks.subscribe).not.toHaveBeenCalled()
})

it('treats a native unknown command response as unsupported in an older desktop shell', async () => {
  Reflect.deleteProperty(window, '__ORBIT_DESKTOP_COMMANDS__')
  mocks.invoke.mockRejectedValue('Command desktop_push not found')
  expect(await loadDesktopPush('account-a')).toMatchObject({ supported: false, status: 'unsupported' })
  await expect(resumeDesktopPush('account-a')).resolves.toBeUndefined()
  await expect(releaseDesktopPush('account-a')).resolves.toBeUndefined()
  expect(mocks.invoke).toHaveBeenCalledWith('desktop_push', { action: 'status' })
  expect(mocks.unsubscribe).not.toHaveBeenCalled()
})

it('retains real native failures during cleanup in an older desktop shell', async () => {
  Reflect.deleteProperty(window, '__ORBIT_DESKTOP_COMMANDS__')
  const failure = new Error('Cannot save native confirmation')
  const native = mocks.invoke.getMockImplementation()!
  mocks.invoke.mockImplementation(async (command, payload) => {
    if (payload.action === 'clear') throw failure
    return native(command, payload)
  })
  await expect(releaseDesktopPush('account-a')).rejects.toBe(failure)
  expect(mocks.unsubscribe).toHaveBeenCalledWith(expect.objectContaining({ endpoint: saved.endpoint }), 'account-a')
  expect(pending).toEqual([{ owner: 'account-a', registration: saved, revoke: true }])
})

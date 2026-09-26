import { beforeEach, expect, it, vi } from 'vitest'
import { clearSupabaseSession } from '@/lib/supabase'

const createClientMock = vi.hoisted(() => vi.fn())
const signOutMock = vi.hoisted(() => vi.fn().mockResolvedValue({ error: null }))

vi.mock('react-native-url-polyfill/auto', () => ({}))
vi.mock('expo-sqlite/localStorage/install', () => ({}))
vi.mock('@supabase/supabase-js', () => ({ createClient: createClientMock }))

const entries = new Map<string, string>()
const storage = {
  getItem: (key: string) => entries.get(key) ?? null,
  setItem: (key: string, value: string) => { entries.set(key, value) },
  removeItem: (key: string) => { entries.delete(key) },
}

beforeEach(() => {
  entries.clear()
  vi.stubGlobal('localStorage', storage)
  createClientMock.mockReturnValue({ auth: { signOut: signOutMock } })
  signOutMock.mockClear()
})

it('removes the project session entry on mobile session teardown', async () => {
  const key = 'sb-wdscxamegetmhqldqsdg-auth-token'
  storage.setItem(key, 'account-a-session')

  await clearSupabaseSession()

  expect(storage.getItem(key)).toBeNull()
  expect(signOutMock).toHaveBeenCalledWith({ scope: 'local' })
})

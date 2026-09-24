import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ signOut: vi.fn(), createClient: vi.fn() }))
vi.mock('@supabase/supabase-js', () => ({
  createClient: mocks.createClient,
}))

import { clearSupabaseSession } from '@/lib/supabase'

describe('Supabase session cleanup', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://wdscxamegetmhqldqsdg.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'publishable-test-key'
    mocks.signOut.mockReset().mockResolvedValue({ error: null })
    mocks.createClient.mockReset().mockReturnValue({ auth: { signOut: mocks.signOut } })
    localStorage.clear()
  })

  it('removes the actual project storage entry before local Supabase sign out', () => {
    const key = 'sb-wdscxamegetmhqldqsdg-auth-token'
    localStorage.setItem(key, 'previous-user-session')

    clearSupabaseSession()

    expect(localStorage.getItem(key)).toBeNull()
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: 'local' })
  })
})

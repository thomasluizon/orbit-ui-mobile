import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockCreateClient = vi.fn().mockReturnValue({ auth: {} })

vi.mock('@supabase/supabase-js', () => ({
  createClient: mockCreateClient,
}))

describe('getSupabaseClient', () => {
  beforeEach(() => {
    vi.resetModules()
    mockCreateClient.mockClear()
  })

  it('throws when config is missing', async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    const { getSupabaseClient } = await import('@/lib/supabase')
    expect(() => getSupabaseClient()).toThrow('Supabase config missing')
  })

  it('creates a client when env vars are set', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-key'

    const { getSupabaseClient } = await import('@/lib/supabase')
    const client = getSupabaseClient()

    expect(mockCreateClient).toHaveBeenCalledWith(
      'https://test.supabase.co',
      'test-key',
    )
    expect(client).toBeDefined()
  })

  it('returns the same client on subsequent calls', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-key'

    const { getSupabaseClient } = await import('@/lib/supabase')
    const client1 = getSupabaseClient()
    const client2 = getSupabaseClient()

    expect(client1).toBe(client2)
    expect(mockCreateClient).toHaveBeenCalledTimes(1)
  })
})

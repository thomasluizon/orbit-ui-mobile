import { describe, it, expect, vi, beforeEach } from 'vitest'
import { API } from '@orbit/shared/api'

const mockServerAuthFetch = vi.fn()
vi.mock('@/lib/server-fetch', () => ({
  serverAuthFetch: mockServerAuthFetch,
}))

const { deleteUserFact, bulkDeleteUserFacts } = await import('@/app/actions/user-facts')

describe('user-facts server actions', () => {
  beforeEach(() => {
    mockServerAuthFetch.mockReset()
    mockServerAuthFetch.mockResolvedValue(undefined)
  })

  it('deletes a single fact through the delete endpoint', async () => {
    await deleteUserFact('fact-1')
    expect(mockServerAuthFetch).toHaveBeenCalledWith(API.userFacts.delete('fact-1'), {
      method: 'DELETE',
    })
  })

  it('bulk-deletes facts with the id list in the body', async () => {
    await bulkDeleteUserFacts(['a', 'b'])
    expect(mockServerAuthFetch).toHaveBeenCalledWith(API.userFacts.bulk, {
      method: 'DELETE',
      body: JSON.stringify({ ids: ['a', 'b'] }),
    })
  })
})

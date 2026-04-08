import { describe, expect, it, vi } from 'vitest'
import { fetchAllPaginatedItems } from '../utils/pagination'

describe('fetchAllPaginatedItems', () => {
  it('returns the first page items when there is only one page', async () => {
    const fetchPage = vi.fn(async () => ({
      items: ['a', 'b'],
      totalPages: 1,
    }))

    await expect(fetchAllPaginatedItems(fetchPage)).resolves.toEqual(['a', 'b'])
    expect(fetchPage).toHaveBeenCalledTimes(1)
    expect(fetchPage).toHaveBeenCalledWith(1)
  })

  it('fetches and flattens all remaining pages in parallel order', async () => {
    const fetchPage = vi.fn(async (page: number) => ({
      items: [`page-${page}-item`],
      totalPages: 3,
    }))

    await expect(fetchAllPaginatedItems(fetchPage)).resolves.toEqual([
      'page-1-item',
      'page-2-item',
      'page-3-item',
    ])
    expect(fetchPage).toHaveBeenCalledTimes(3)
    expect(fetchPage).toHaveBeenNthCalledWith(1, 1)
    expect(fetchPage).toHaveBeenNthCalledWith(2, 2)
    expect(fetchPage).toHaveBeenNthCalledWith(3, 3)
  })
})

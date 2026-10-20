import { expect, it, vi } from 'vitest'
import { notFound } from 'next/navigation'
import MissingPage from '@/app/(app)/[...missing]/page'

vi.mock('next/navigation', () => ({ notFound: vi.fn() }))

it('sends unmatched app paths to the segment not-found page', () => {
  MissingPage()
  expect(notFound).toHaveBeenCalledOnce()
})

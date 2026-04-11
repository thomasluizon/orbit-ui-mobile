import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import React from 'react'
import { SkeletonLine, SkeletonCard, SkeletonAvatar } from '@/components/ui/skeleton'

describe('SkeletonLine', () => {
  it('renders with default classes', () => {
    const { container } = render(<SkeletonLine />)
    const div = container.firstChild as HTMLElement
    expect(div).toHaveClass('skeleton-shimmer')
    expect(div).toHaveAttribute('aria-hidden', 'true')
  })

  it('applies custom width and height', () => {
    const { container } = render(<SkeletonLine width="w-1/2" height="h-5" />)
    const div = container.firstChild as HTMLElement
    expect(div).toHaveClass('w-1/2')
    expect(div).toHaveClass('h-5')
  })

  it('applies custom className', () => {
    const { container } = render(<SkeletonLine className="mt-4" />)
    const div = container.firstChild as HTMLElement
    expect(div).toHaveClass('mt-4')
  })
})

describe('SkeletonCard', () => {
  it('renders default 3 lines', () => {
    const { container } = render(<SkeletonCard />)
    const card = container.firstChild as HTMLElement
    expect(card).toHaveAttribute('aria-hidden', 'true')
    // 3 skeleton lines by default
    const lines = card.querySelectorAll('.skeleton-shimmer')
    expect(lines).toHaveLength(3)
  })

  it('renders custom number of lines', () => {
    const { container } = render(<SkeletonCard lines={5} />)
    const card = container.firstChild as HTMLElement
    const lines = card.querySelectorAll('.skeleton-shimmer')
    expect(lines).toHaveLength(5)
  })

  it('first line is wider (h-4) than others', () => {
    const { container } = render(<SkeletonCard lines={3} />)
    const card = container.firstChild as HTMLElement
    const lines = card.querySelectorAll('.skeleton-shimmer')
    expect(lines[0]).toHaveClass('h-4')
    expect(lines[0]).toHaveClass('w-1/3')
  })

  it('last line has w-2/3', () => {
    const { container } = render(<SkeletonCard lines={3} />)
    const card = container.firstChild as HTMLElement
    const lines = card.querySelectorAll('.skeleton-shimmer')
    expect(lines[2]).toHaveClass('w-2/3')
  })

  it('applies className', () => {
    const { container } = render(<SkeletonCard className="my-card" />)
    const card = container.firstChild as HTMLElement
    expect(card).toHaveClass('my-card')
  })
})

describe('SkeletonAvatar', () => {
  it('renders with default md size', () => {
    const { container } = render(<SkeletonAvatar />)
    const div = container.firstChild as HTMLElement
    expect(div).toHaveClass('size-10') // md
    expect(div).toHaveClass('rounded-full')
    expect(div).toHaveAttribute('aria-hidden', 'true')
  })

  it('renders with sm size', () => {
    const { container } = render(<SkeletonAvatar size="sm" />)
    const div = container.firstChild as HTMLElement
    expect(div).toHaveClass('size-8')
  })

  it('renders with lg size', () => {
    const { container } = render(<SkeletonAvatar size="lg" />)
    const div = container.firstChild as HTMLElement
    expect(div).toHaveClass('size-14')
  })

  it('applies className', () => {
    const { container } = render(<SkeletonAvatar className="ml-4" />)
    const div = container.firstChild as HTMLElement
    expect(div).toHaveClass('ml-4')
  })
})

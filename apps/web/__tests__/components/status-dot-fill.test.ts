import { describe, expect, it } from 'vitest'
import { resolveStatusDotFill } from '@/components/ui/status-dot-fill'

describe('resolveStatusDotFill', () => {
  it('renders a solid fill when filled', () => {
    expect(resolveStatusDotFill(true, 'var(--status-done)')).toEqual({
      background: 'var(--status-done)',
      boxShadow: 'none',
    })
  })

  it('renders a hollow inset ring when not filled', () => {
    expect(resolveStatusDotFill(false, 'var(--status-empty)')).toEqual({
      background: 'transparent',
      boxShadow: 'inset 0 0 0 1.5px var(--status-empty)',
    })
  })
})

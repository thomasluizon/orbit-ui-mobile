import { describe, expect, it } from 'vitest'
import { resolveStatusDotFill } from '@/components/ui/status-dot-fill'

describe('resolveStatusDotFill', () => {
  it('renders a solid fill with no border when filled', () => {
    expect(resolveStatusDotFill(true, '#22c55e')).toEqual({
      backgroundColor: '#22c55e',
      borderWidth: 0,
      borderColor: 'transparent',
    })
  })

  it('renders a hollow ring in the dot color when not filled', () => {
    expect(resolveStatusDotFill(false, '#64748b')).toEqual({
      backgroundColor: 'transparent',
      borderWidth: 1.5,
      borderColor: '#64748b',
    })
  })
})

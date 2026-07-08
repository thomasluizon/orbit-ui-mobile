import { describe, expect, it } from 'vitest'
import { resolveAppBarRightActionLabel } from '@/components/ui/app-bar'

describe('resolveAppBarRightActionLabel', () => {
  const t = (key: string) => key

  it('returns undefined when there is no right action', () => {
    expect(resolveAppBarRightActionLabel(undefined, undefined, t)).toBeUndefined()
  })

  it('prefers an explicit label over the variant fallback', () => {
    expect(resolveAppBarRightActionLabel('share', 'Compartilhar', t)).toBe('Compartilhar')
  })

  it('falls back to the namespaced variant key', () => {
    expect(resolveAppBarRightActionLabel('help', undefined, t)).toBe('common.help')
    expect(resolveAppBarRightActionLabel('close', undefined, t)).toBe('common.close')
    expect(resolveAppBarRightActionLabel('share', undefined, t)).toBe('common.share')
  })
})

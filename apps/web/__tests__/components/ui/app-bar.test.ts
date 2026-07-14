import { describe, expect, it } from 'vitest'
import { resolveAppBarRightActionLabel } from '@/components/ui/app-bar-right-action'

describe('resolveAppBarRightActionLabel', () => {
  const t = (key: string) => key

  it('returns undefined when there is no right action', () => {
    expect(resolveAppBarRightActionLabel(undefined, undefined, t)).toBeUndefined()
  })

  it('prefers an explicit label over the variant fallback', () => {
    expect(resolveAppBarRightActionLabel('help', 'Custom', t)).toBe('Custom')
  })

  it('falls back to the variant key', () => {
    expect(resolveAppBarRightActionLabel('help', undefined, t)).toBe('help')
    expect(resolveAppBarRightActionLabel('close', undefined, t)).toBe('close')
    expect(resolveAppBarRightActionLabel('share', undefined, t)).toBe('share')
  })
})

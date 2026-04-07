import { describe, expect, it } from 'vitest'
import { normalizePermissionStatus } from '@/lib/push-notification-permissions'

describe('normalizePermissionStatus', () => {
  it('treats askable denied permissions as undetermined', () => {
    expect(
      normalizePermissionStatus({
        status: 'denied',
        canAskAgain: true,
      }),
    ).toBe('undetermined')
  })

  it('keeps permanently denied permissions as denied', () => {
    expect(
      normalizePermissionStatus({
        status: 'denied',
        canAskAgain: false,
      }),
    ).toBe('denied')
  })

  it('treats denied permissions without canAskAgain metadata as undetermined', () => {
    expect(
      normalizePermissionStatus({
        status: 'denied',
      }),
    ).toBe('undetermined')
  })

  it('keeps granted permissions as granted', () => {
    expect(
      normalizePermissionStatus({
        status: 'granted',
        granted: true,
      }),
    ).toBe('granted')
  })
})

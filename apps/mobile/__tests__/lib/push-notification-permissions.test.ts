import { describe, expect, it } from 'vitest'

import { normalizePermissionStatus } from '@/lib/push-notification-permissions'

describe('normalizePermissionStatus', () => {
  it('maps an explicit granted flag to granted regardless of status text', () => {
    expect(
      normalizePermissionStatus({ status: 'undetermined', granted: true }),
    ).toBe('granted')
  })

  it('maps a granted status to granted when the flag is absent', () => {
    expect(normalizePermissionStatus({ status: 'granted' })).toBe('granted')
  })

  it('treats a denied status that can still be re-asked as undetermined', () => {
    expect(
      normalizePermissionStatus({ status: 'denied', canAskAgain: true }),
    ).toBe('undetermined')
  })

  it('treats a denied status with an omitted canAskAgain as undetermined', () => {
    expect(normalizePermissionStatus({ status: 'denied' })).toBe('undetermined')
  })

  it('maps a permanently denied status (canAskAgain false) to denied', () => {
    expect(
      normalizePermissionStatus({ status: 'denied', canAskAgain: false }),
    ).toBe('denied')
  })

  it('defaults an undetermined status to undetermined', () => {
    expect(normalizePermissionStatus({ status: 'undetermined' })).toBe(
      'undetermined',
    )
  })

  it('defaults any unrecognized status to undetermined', () => {
    expect(normalizePermissionStatus({ status: 'provisional' })).toBe(
      'undetermined',
    )
  })
})

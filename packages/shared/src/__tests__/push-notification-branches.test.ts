import { describe, expect, it } from 'vitest'
import {
  getNativePushStatusMessageKey,
  getNativePushStatusPresentation,
  getNativePushStatusTone,
  getPushStatusToneClass,
  type NativePushStatusSnapshot,
} from '../utils/push-notification-settings'

function snapshot(overrides: Partial<NativePushStatusSnapshot> = {}): NativePushStatusSnapshot {
  return {
    permissionStatus: 'granted',
    registrationStatus: 'registered',
    isEnabled: true,
    isRegistered: true,
    ...overrides,
  }
}

describe('getPushStatusToneClass', () => {
  it('maps each tone to its token class', () => {
    expect(getPushStatusToneClass('critical')).toBe('text-[var(--status-bad-text)]')
    expect(getPushStatusToneClass('muted')).toBe('text-[var(--fg-3)]')
  })
})

describe('getNativePushStatusTone', () => {
  it.each(['sync-failed', 'token-missing'] as const)(
    'keeps the denied message muted alongside %s', (registrationStatus) => {
      expect(getNativePushStatusPresentation(snapshot({
        permissionStatus: 'denied', registrationStatus, isEnabled: false, isRegistered: false,
      }))).toEqual({ messageKey: 'settings.notifications.deniedNative', tone: 'muted' })
    },
  )

  it('keeps failures critical and permission boundaries muted', () => {
    expect(getNativePushStatusPresentation(snapshot({ registrationStatus: 'idle', permissionStatus: 'denied' })).tone).toBe('muted')
    expect(getNativePushStatusTone('permission-denied', null)).toBe('muted')
    expect(getNativePushStatusTone('sync-failed', 'granted')).toBe('critical')
    expect(getNativePushStatusTone('token-missing', 'granted')).toBe('critical')
    expect(getNativePushStatusTone('registered', 'granted')).toBe('muted')
    expect(getNativePushStatusTone('idle', 'undetermined')).toBe('muted')
  })
})

describe('getNativePushStatusMessageKey', () => {
  it('returns the registered key when registration succeeded', () => {
    expect(getNativePushStatusMessageKey(snapshot({ registrationStatus: 'registered' }))).toBe(
      'settings.notifications.registered',
    )
  })

  it('falls back to enabled/disabled based on the enabled flag', () => {
    expect(
      getNativePushStatusMessageKey(
        snapshot({ registrationStatus: 'idle', isRegistered: true, isEnabled: true }),
      ),
    ).toBe('settings.notifications.enabled')
    expect(
      getNativePushStatusMessageKey(
        snapshot({ registrationStatus: 'idle', isRegistered: true, isEnabled: false }),
      ),
    ).toBe('settings.notifications.disabled')
  })

  it('prompts to register when permission is granted but not registered', () => {
    expect(
      getNativePushStatusMessageKey(
        snapshot({ registrationStatus: 'idle', isRegistered: false, permissionStatus: 'granted' }),
      ),
    ).toBe('settings.notifications.notRegistered')
  })
})

import { describe, expect, it } from 'vitest'
import {
  getNativePushStatusMessageKey,
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
    expect(getPushStatusToneClass('accent')).toBe('text-[var(--primary)]')
    expect(getPushStatusToneClass('muted')).toBe('text-[var(--fg-3)]')
  })
})

describe('getNativePushStatusTone', () => {
  it('is critical for denied/failed states, accent when registered, otherwise muted', () => {
    expect(getNativePushStatusTone('token-missing', 'granted')).toBe('critical')
    expect(getNativePushStatusTone('registered', 'granted')).toBe('accent')
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

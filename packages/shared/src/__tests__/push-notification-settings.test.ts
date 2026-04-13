import { describe, expect, it } from 'vitest'
import {
  getNativePushStatusMessageKey,
  getNativePushStatusPresentation,
  getNativePushStatusTone,
  getPushStatusToneClass,
  getWebPushStatusMessageKey,
  getWebPushStatusPresentation,
  getWebPushStatusTone,
  shouldShowNativePushPrompt,
} from '../utils/push-notification-settings'

describe('push notification settings presenters', () => {
  it('maps web push statuses to shared tone classes', () => {
    expect(getPushStatusToneClass(getWebPushStatusTone('denied'))).toBe('text-red-400')
    expect(getPushStatusToneClass(getWebPushStatusTone('sync-failed'))).toBe('text-red-400')
    expect(getPushStatusToneClass(getWebPushStatusTone('registered'))).toBe('text-primary')
    expect(getPushStatusToneClass(getWebPushStatusTone('not-registered'))).toBe('text-text-muted')
  })

  it('maps web push statuses to the expected translation keys', () => {
    expect(getWebPushStatusMessageKey('denied', 'denied')).toBe('settings.notifications.denied')
    expect(getWebPushStatusMessageKey('requesting', 'default')).toBe(
      'settings.notifications.requesting',
    )
    expect(getWebPushStatusMessageKey('registered', 'granted')).toBe(
      'settings.notifications.registered',
    )
    expect(getWebPushStatusMessageKey('sync-failed', 'granted')).toBe(
      'settings.notifications.syncFailed',
    )
    expect(getWebPushStatusMessageKey('not-registered', 'granted')).toBe(
      'settings.notifications.notRegistered',
    )
    expect(getWebPushStatusMessageKey('not-registered', 'default')).toBe(
      'settings.notifications.disabled',
    )
  })

  it('builds a complete web push presentation snapshot', () => {
    expect(getWebPushStatusPresentation('registered', 'granted')).toEqual({
      messageKey: 'settings.notifications.registered',
      tone: 'accent',
    })
  })

  it('maps native push status to permission-denied messaging', () => {
    expect(
      getNativePushStatusMessageKey({
        permissionStatus: 'denied',
        registrationStatus: 'idle',
        isEnabled: false,
        isRegistered: false,
      }),
    ).toBe('settings.notifications.deniedNative')
    expect(getNativePushStatusTone('permission-denied', null)).toBe('critical')
  })

  it('maps native registration edge states to the expected translation keys', () => {
    expect(
      getNativePushStatusMessageKey({
        permissionStatus: 'undetermined',
        registrationStatus: 'registering',
        isEnabled: false,
        isRegistered: false,
      }),
    ).toBe('settings.notifications.requesting')
    expect(
      getNativePushStatusMessageKey({
        permissionStatus: 'granted',
        registrationStatus: 'sync-failed',
        isEnabled: false,
        isRegistered: false,
      }),
    ).toBe('settings.notifications.syncFailed')
    expect(
      getNativePushStatusMessageKey({
        permissionStatus: 'granted',
        registrationStatus: 'token-missing',
        isEnabled: false,
        isRegistered: false,
      }),
    ).toBe('settings.notifications.tokenMissing')
  })

  it('maps native granted-but-unsynced state to not-registered', () => {
    expect(
      getNativePushStatusPresentation({
        permissionStatus: 'granted',
        registrationStatus: 'idle',
        isEnabled: false,
        isRegistered: false,
      }),
    ).toEqual({
      messageKey: 'settings.notifications.notRegistered',
      tone: 'muted',
    })
  })

  it('maps intentionally disabled native push state to disabled messaging', () => {
    expect(
      getNativePushStatusPresentation({
        permissionStatus: 'granted',
        registrationStatus: 'disabled',
        isEnabled: false,
        isRegistered: false,
      }),
    ).toEqual({
      messageKey: 'settings.notifications.disabled',
      tone: 'muted',
    })
  })

  it('shows the native push prompt only after onboarding when Orbit is not yet registered', () => {
    expect(
      shouldShowNativePushPrompt({
        hasCompletedOnboarding: false,
        isDismissed: false,
        isEnabled: false,
        isRegistered: false,
        isSupported: true,
        permissionStatus: 'undetermined',
        registrationStatus: 'permission-undetermined',
      }),
    ).toBe(false)

    expect(
      shouldShowNativePushPrompt({
        hasCompletedOnboarding: true,
        isDismissed: false,
        isEnabled: false,
        isRegistered: false,
        isSupported: true,
        permissionStatus: 'undetermined',
        registrationStatus: 'permission-undetermined',
      }),
    ).toBe(true)
  })

  it('does not show the native push prompt after the user disables Orbit notifications', () => {
    expect(
      shouldShowNativePushPrompt({
        hasCompletedOnboarding: true,
        isDismissed: false,
        isEnabled: false,
        isRegistered: false,
        isSupported: true,
        permissionStatus: 'granted',
        registrationStatus: 'disabled',
      }),
    ).toBe(false)
  })
})

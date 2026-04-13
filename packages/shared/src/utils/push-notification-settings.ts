export type PushStatusTone = 'accent' | 'critical' | 'muted'

export type WebPushPermission = 'default' | 'denied' | 'granted' | ''

export type WebPushPreferenceStatus =
  | 'unsupported'
  | 'denied'
  | 'not-registered'
  | 'registered'
  | 'sync-failed'
  | 'requesting'

export type NativePushPermissionStatus = 'granted' | 'denied' | 'undetermined' | null

export type NativePushRegistrationStatus =
  | 'unsupported'
  | 'idle'
  | 'disabled'
  | 'permission-undetermined'
  | 'permission-denied'
  | 'registering'
  | 'token-missing'
  | 'sync-failed'
  | 'registered'

export interface PushStatusPresentation {
  messageKey: string
  tone: PushStatusTone
}

export interface NativePushStatusSnapshot {
  permissionStatus: NativePushPermissionStatus
  registrationStatus: NativePushRegistrationStatus
  isEnabled: boolean
  isRegistered: boolean
}

export interface NativePushPromptSnapshot extends NativePushStatusSnapshot {
  hasCompletedOnboarding: boolean
  isSupported: boolean
  isDismissed: boolean
}

export function getPushStatusToneClass(tone: PushStatusTone): string {
  if (tone === 'critical') {
    return 'text-red-400'
  }

  if (tone === 'accent') {
    return 'text-primary'
  }

  return 'text-text-muted'
}

export function getWebPushStatusTone(status: WebPushPreferenceStatus): PushStatusTone {
  if (status === 'denied' || status === 'sync-failed') {
    return 'critical'
  }

  if (status === 'registered') {
    return 'accent'
  }

  return 'muted'
}

export function getWebPushStatusMessageKey(
  status: WebPushPreferenceStatus,
  permission: WebPushPermission,
): string {
  if (status === 'denied') {
    return 'settings.notifications.denied'
  }

  if (status === 'requesting') {
    return 'settings.notifications.requesting'
  }

  if (status === 'registered') {
    return 'settings.notifications.registered'
  }

  if (status === 'sync-failed') {
    return 'settings.notifications.syncFailed'
  }

  if (status === 'not-registered' && permission === 'granted') {
    return 'settings.notifications.notRegistered'
  }

  return 'settings.notifications.disabled'
}

export function getNativePushStatusTone(
  registrationStatus: NativePushRegistrationStatus,
  permissionStatus: NativePushPermissionStatus,
): PushStatusTone {
  if (
    permissionStatus === 'denied' ||
    registrationStatus === 'permission-denied' ||
    registrationStatus === 'sync-failed' ||
    registrationStatus === 'token-missing'
  ) {
    return 'critical'
  }

  if (registrationStatus === 'registered') {
    return 'accent'
  }

  return 'muted'
}

export function getNativePushStatusMessageKey({
  permissionStatus,
  registrationStatus,
  isEnabled,
  isRegistered,
}: NativePushStatusSnapshot): string {
  if (permissionStatus === 'denied' || registrationStatus === 'permission-denied') {
    return 'settings.notifications.deniedNative'
  }

  if (registrationStatus === 'registering') {
    return 'settings.notifications.requesting'
  }

  if (registrationStatus === 'registered') {
    return 'settings.notifications.registered'
  }

  if (registrationStatus === 'sync-failed') {
    return 'settings.notifications.syncFailed'
  }

  if (registrationStatus === 'token-missing') {
    return 'settings.notifications.tokenMissing'
  }

  if (registrationStatus === 'disabled') {
    return 'settings.notifications.disabled'
  }

  if (permissionStatus === 'granted' && !isRegistered) {
    return 'settings.notifications.notRegistered'
  }

  return isEnabled ? 'settings.notifications.enabled' : 'settings.notifications.disabled'
}

export function getNativePushStatusPresentation(
  snapshot: NativePushStatusSnapshot,
): PushStatusPresentation {
  return {
    messageKey: getNativePushStatusMessageKey(snapshot),
    tone: getNativePushStatusTone(snapshot.registrationStatus, snapshot.permissionStatus),
  }
}

export function getWebPushStatusPresentation(
  status: WebPushPreferenceStatus,
  permission: WebPushPermission,
): PushStatusPresentation {
  return {
    messageKey: getWebPushStatusMessageKey(status, permission),
    tone: getWebPushStatusTone(status),
  }
}

export function shouldShowNativePushPrompt({
  hasCompletedOnboarding,
  isDismissed,
  isEnabled,
  isRegistered,
  isSupported,
  permissionStatus,
  registrationStatus,
}: NativePushPromptSnapshot): boolean {
  if (!hasCompletedOnboarding || isDismissed) {
    return false
  }

  if (
    !isSupported ||
    permissionStatus === null ||
    permissionStatus === 'denied' ||
    registrationStatus === 'unsupported' ||
    registrationStatus === 'permission-denied' ||
    registrationStatus === 'disabled' ||
    registrationStatus === 'registering' ||
    registrationStatus === 'registered' ||
    isEnabled ||
    isRegistered
  ) {
    return false
  }

  return permissionStatus === 'undetermined' || permissionStatus === 'granted'
}

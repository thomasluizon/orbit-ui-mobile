export type NotificationPermissionStatus = 'granted' | 'denied' | 'undetermined'

export interface NotificationPermissionsResponse {
  status: string
  granted?: boolean
  canAskAgain?: boolean
}

export function normalizePermissionStatus(
  permissions: NotificationPermissionsResponse,
): NotificationPermissionStatus {
  if (permissions.granted || permissions.status === 'granted') {
    return 'granted'
  }

  if (permissions.status === 'denied' && permissions.canAskAgain !== false) {
    return 'undetermined'
  }

  if (permissions.status === 'denied') {
    return 'denied'
  }

  return 'undetermined'
}

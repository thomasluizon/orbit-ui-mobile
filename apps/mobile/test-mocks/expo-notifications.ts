import { vi } from 'vitest'

export const AndroidImportance = {
  LOW: 4,
  MAX: 5,
}

export const setNotificationHandler = vi.fn()
export const setNotificationChannelAsync = vi.fn(
  async (_channelId: string, _options: Record<string, unknown>) => {},
)
export const scheduleNotificationAsync = vi.fn(
  async (_request: unknown) => 'orbit-persistent-reminder',
)
export const dismissNotificationAsync = vi.fn(async (_identifier: string) => {})
export const getPermissionsAsync = vi.fn(async () => ({
  status: 'undetermined',
  granted: false,
  canAskAgain: true,
}))
export const requestPermissionsAsync = vi.fn(async () => ({
  status: 'granted',
  granted: true,
  canAskAgain: true,
}))
export const getExpoPushTokenAsync = vi.fn(async () => ({ data: 'expo-token' }))
export const getDevicePushTokenAsync = vi.fn(async () => ({ type: 'fcm', data: 'native-token' }))
export const addNotificationResponseReceivedListener = vi.fn(() => ({
  remove: vi.fn(),
}))

export function resetExpoNotificationsMocks(): void {
  setNotificationHandler.mockClear()
  setNotificationChannelAsync.mockReset()
  setNotificationChannelAsync.mockResolvedValue(undefined)
  scheduleNotificationAsync.mockReset()
  scheduleNotificationAsync.mockResolvedValue('orbit-persistent-reminder')
  dismissNotificationAsync.mockReset()
  dismissNotificationAsync.mockResolvedValue(undefined)
  getPermissionsAsync.mockReset()
  getPermissionsAsync.mockResolvedValue({
    status: 'undetermined',
    granted: false,
    canAskAgain: true,
  })
  requestPermissionsAsync.mockReset()
  requestPermissionsAsync.mockResolvedValue({
    status: 'granted',
    granted: true,
    canAskAgain: true,
  })
  getExpoPushTokenAsync.mockReset()
  getExpoPushTokenAsync.mockResolvedValue({ data: 'expo-token' })
  getDevicePushTokenAsync.mockReset()
  getDevicePushTokenAsync.mockResolvedValue({ type: 'fcm', data: 'native-token' })
  addNotificationResponseReceivedListener.mockReset()
  addNotificationResponseReceivedListener.mockImplementation(() => ({
    remove: vi.fn(),
  }))
}

const expoNotificationsMock = {
  AndroidImportance,
  setNotificationHandler,
  setNotificationChannelAsync,
  scheduleNotificationAsync,
  dismissNotificationAsync,
  getPermissionsAsync,
  requestPermissionsAsync,
  getExpoPushTokenAsync,
  getDevicePushTokenAsync,
  addNotificationResponseReceivedListener,
}

export default expoNotificationsMock

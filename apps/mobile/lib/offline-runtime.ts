import NetInfo from '@react-native-community/netinfo'

let cachedOnline = true

export function setCachedConnectivity(online: boolean): void {
  cachedOnline = online
}

export async function getCurrentConnectivity(): Promise<boolean> {
  try {
    const state = await NetInfo.fetch()
    const online = state.isConnected === true && state.isInternetReachable !== false
    cachedOnline = online
    return online
  } catch {
    return cachedOnline
  }
}

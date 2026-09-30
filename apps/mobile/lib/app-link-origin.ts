import Constants from 'expo-constants'

const extra: unknown = Constants.expoConfig?.extra
const router = typeof extra === 'object' && extra !== null && 'router' in extra
  ? extra.router
  : undefined

export const APP_LINK_ORIGIN = typeof router === 'object' && router !== null
  && 'origin' in router && typeof router.origin === 'string'
  ? router.origin
  : 'https://app.useorbit.org'

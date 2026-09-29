const configuredApiBase = process.env.EXPO_PUBLIC_API_BASE

if (!configuredApiBase && process.env.NODE_ENV === 'production') {
  throw new Error('EXPO_PUBLIC_API_BASE is required for production builds')
}

export const API_BASE = configuredApiBase ?? 'https://api.useorbit.org'

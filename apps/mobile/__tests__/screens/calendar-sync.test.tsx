import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockProfile } from '@orbit/shared/__tests__/factories'

const TestRenderer = require('react-test-renderer')

const colorProxy: any = new Proxy(
  {},
  {
    get: (_target, prop) => (prop === 'white' ? '#ffffff' : '#111111'),
  },
)

const mocks = vi.hoisted(() => {
  const queryClient = {
    invalidateQueries: vi.fn(async () => {}),
  }

  return {
    apiClient: vi.fn(),
    queryClient,
    router: {
      push: vi.fn(),
      replace: vi.fn(),
    },
  }
})

vi.mock('expo-router', async () => {
  const React = await import('react')

  return {
    useRouter: () => mocks.router,
    useLocalSearchParams: () => ({}),
    useFocusEffect: (callback: () => void | (() => void)) => {
      React.useEffect(() => callback(), [callback])
    },
  }
})

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}(${JSON.stringify(params)})` : key,
  }),
}))

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => mocks.queryClient,
}))

vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({
    profile: createMockProfile({ hasProAccess: true }),
    isLoading: false,
  }),
}))

vi.mock('@/hooks/use-habits', () => ({
  useBulkCreateHabits: () => ({
    mutateAsync: vi.fn(),
  }),
}))

vi.mock('@/hooks/use-calendar-auto-sync', () => ({
  useCalendarAutoSyncState: () => ({
    data: {
      enabled: false,
      status: 'Idle',
      lastSyncedAt: null,
      hasGoogleConnection: true,
    },
    isLoading: false,
  }),
  useCalendarSyncSuggestions: () => ({
    data: [],
    isLoading: false,
    isError: false,
    error: null,
  }),
  useSetCalendarAutoSync: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
  useRunCalendarSyncNow: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
}))

vi.mock('@/lib/api-client', () => ({
  apiClient: mocks.apiClient,
}))

vi.mock('@/lib/google-auth', () => ({
  startMobileGoogleAuth: vi.fn(),
}))

vi.mock('@/lib/use-app-theme', () => ({
  useAppTheme: () => ({
    colors: colorProxy,
  }),
}))

vi.mock('@/hooks/use-offline', () => ({
  useOffline: () => ({
    isOnline: true,
  }),
}))

vi.mock('@/hooks/use-app-toast', () => ({
  useAppToast: () => ({
    showError: vi.fn(),
  }),
}))

vi.mock('@/components/ui/offline-unavailable-state', () => ({
  OfflineUnavailableState: () => null,
}))

vi.mock('lucide-react-native', () => {
  const createIcon = (name: string) => (props: any) => React.createElement(name, props)

  return {
    AlertTriangle: createIcon('AlertTriangle'),
    ArrowLeft: createIcon('ArrowLeft'),
    Bell: createIcon('Bell'),
    CalendarDays: createIcon('CalendarDays'),
    Check: createIcon('Check'),
    Link: createIcon('Link'),
    Loader2: createIcon('Loader2'),
    RefreshCw: createIcon('RefreshCw'),
  }
})

vi.mock('react-native', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-native')>()
  return {
    ...actual,
    Switch: (props: Record<string, unknown>) => React.createElement('Switch', props),
  }
})

import CalendarSyncScreen from '@/app/calendar-sync'

describe('CalendarSyncScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.apiClient.mockResolvedValue([])
  })

  it('fetches calendar events once after the screen settles', async () => {
    await TestRenderer.act(async () => {
      TestRenderer.create(<CalendarSyncScreen />)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(mocks.apiClient).toHaveBeenCalledTimes(1)
    expect(mocks.apiClient).toHaveBeenCalledWith('/api/calendar/events')
  })
})

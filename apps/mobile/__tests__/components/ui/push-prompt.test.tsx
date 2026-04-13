import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const TestRenderer = require('react-test-renderer')

const storage = new Map<string, string>()
const requestPermission = vi.fn(async () => true)

const colorProxy = new Proxy(
  {},
  {
    get: (_target, prop: string) => {
      if (prop === 'white') return '#ffffff'
      if (prop.endsWith('10')) return 'rgba(255,255,255,0.1)'
      return '#111111'
    },
  },
)

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(async (key: string) => storage.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => {
      storage.set(key, value)
    }),
  },
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

vi.mock('@/hooks/use-push-notifications', () => ({
  usePushNotifications: () => ({
    isEnabled: false,
    isRegistered: false,
    isSupported: true,
    permissionStatus: 'undetermined',
    registrationStatus: 'permission-undetermined',
    requestPermission,
  }),
}))

vi.mock('@/lib/use-app-theme', () => ({
  useAppTheme: () => ({
    colors: colorProxy,
    shadows: {
      lg: {},
    },
  }),
}))

vi.mock('lucide-react-native', () => {
  const createIcon = (name: string) => (props: Record<string, unknown>) =>
    React.createElement(name, props)

  return {
    BellRing: createIcon('BellRing'),
    X: createIcon('X'),
  }
})

vi.mock('react-native', async (importOriginal) => {
  const actual = await importOriginal() as typeof import('react-native')
  const start = (callback?: () => void) => {
    callback?.()
  }

  return {
    ...actual,
    Animated: {
      ...actual.Animated,
      timing: vi.fn(() => ({ start })),
      parallel: vi.fn(() => ({ start })),
    },
  }
})

import { PushPrompt } from '@/components/ui/push-prompt'

function findPressableByText(root: any, label: string) {
  return root.find(
    (node: any) =>
      typeof node.type !== 'string' &&
      typeof node.props?.onPress === 'function' &&
      node.findAll(
        (child: any) => child.type === 'Text' && child.props?.children === label,
      ).length > 0,
  )
}

describe('PushPrompt (mobile)', () => {
  beforeEach(() => {
    storage.clear()
    requestPermission.mockClear()
  })

  it('does not auto-request notification permission on initial render', async () => {
    await TestRenderer.act(async () => {
      TestRenderer.create(<PushPrompt />)
    })

    expect(requestPermission).not.toHaveBeenCalled()
  })

  it('requests permission only after tapping Enable', async () => {
    let tree: any

    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<PushPrompt />)
    })

    const enableButton = findPressableByText(tree.root, 'pushPrompt.enable')

    await TestRenderer.act(async () => {
      enableButton.props.onPress()
    })

    expect(requestPermission).toHaveBeenCalledTimes(1)
  })

  it('stays hidden after the prompt was dismissed previously', async () => {
    storage.set('orbit_push_prompted', '1')

    let tree: any
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<PushPrompt />)
    })

    expect(() => tree.root.findByProps({ children: 'pushPrompt.title' })).toThrow()
  })
})

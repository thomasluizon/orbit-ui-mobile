import type { ReactElement } from 'react'
import { StyleSheet } from 'react-native'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMockProactiveItem } from '@orbit/shared/__tests__/factories'
import { PushDevicesRow } from '@/components/profile/push-devices-row'
import NotionCallbackScreen from '@/app/auth-callback/notion'
import { ProactiveAction } from '@/components/chat/proactive-action'
import { createTokensV2 } from '@/lib/theme'

const mocks = vi.hoisted(() => ({ reason: 'common.loading', act: vi.fn() }))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }) }))
vi.mock('expo-router', () => ({ useRouter: () => ({ replace: vi.fn() }), useLocalSearchParams: () => ({ code: 'c', state: 's' }) }))
vi.mock('@tanstack/react-query', async (original) => ({ ...await original<typeof import('@tanstack/react-query')>(), useQueryClient: () => ({ invalidateQueries: vi.fn() }) }))
vi.mock('@/lib/api-client', () => ({ apiClient: () => new Promise(() => {}) }))
vi.mock('@/lib/use-app-theme', () => ({ useAppTheme: () => ({ currentScheme: 'purple', currentTheme: 'dark' }) }))
vi.mock('@/hooks/use-proactive-action', () => ({ useProactiveAction: () => ({ reason: mocks.reason, allowance: 10, act: mocks.act, aiMessagesPeriod: 'day' }) }))

const TestRenderer = require('react-test-renderer')
const tokens = createTokensV2('purple', 'dark')

type Node = { type: unknown; props: Record<string, any>; findAll(predicate: (node: Node) => boolean): Node[] }

let tree: { root: Node; unmount(): void } | undefined

afterEach(() => { TestRenderer.act(() => tree?.unmount()); tree = undefined; mocks.reason = 'common.loading'; mocks.act.mockClear() })

function render(element: ReactElement) {
  TestRenderer.act(() => { tree = TestRenderer.create(element) })
  return tree!.root
}

function hosts(root: Node, testID: string) {
  return root.findAll((node) => typeof node.type === 'string' && node.props.testID === testID)
}

function texts(root: Node) {
  return root.findAll((node) => node.type === 'Text').flatMap((node) => [node.props.children].flat()).filter((child) => typeof child === 'string')
}

function expectNoSpinner(root: Node) {
  expect(root.findAll((node) => node.type === 'ActivityIndicator' || node.type === 'RefreshControl')).toHaveLength(0)
}

describe('a wait shows a skeleton shaped like its final layout on Android, never Loading text', () => {
  it('holds the device line under the alerts switch with a named skeleton line', () => {
    const root = render(<PushDevicesRow tokens={tokens} count={undefined} max={undefined} currentDeviceRegistered={false} supported loading error={false}
      permissionStatus="granted" registrationStatus="idle" onToggle={vi.fn()} onOpenSettings={vi.fn()} onRetry={vi.fn()} />)
    const slot = hosts(root, 'push-devices-skeleton')
    expect(slot).toHaveLength(1)
    expect(StyleSheet.flatten(slot[0]!.props.style)).toMatchObject({ paddingHorizontal: 16, paddingBottom: 12 })
    expect(hosts(slot[0]!, 'skeleton-unit-fill')[0]!.props).toMatchObject({ accessibilityRole: 'progressbar', accessibilityLabel: 'profile.loading', accessibilityState: { busy: true } })
    expect(texts(root)).not.toContain('profile.loading')
    expectNoSpinner(root)
  })

  it('holds the Notion return with the settings rows it lands on', () => {
    const root = render(<NotionCallbackScreen />)
    const skeleton = hosts(root, 'skeleton-unit-settings')
    expect(skeleton).toHaveLength(1)
    expect(skeleton[0]!.props).toMatchObject({ accessibilityRole: 'progressbar', accessibilityLabel: 'common.loading', accessibilityState: { busy: true } })
    expect(hosts(skeleton[0]!, 'settings-skeleton-row')).toHaveLength(2)
    expect(texts(root)).not.toContain('common.loading')
    expectNoSpinner(root)
  })

  it('keeps the proactive action label on its skeleton face while its status loads, with no Loading line', () => {
    const root = render(<ProactiveAction item={createMockProactiveItem()} acted={false} isOnline onSend={vi.fn()} />)
    const action = root.findAll((node) => typeof node.type === 'string' && node.props.accessibilityRole === 'button')[0]!
    expect(action.props).toMatchObject({ disabled: true, accessibilityState: { disabled: true, busy: true }, accessibilityHint: undefined })
    const style = StyleSheet.flatten(typeof action.props.style === 'function' ? action.props.style({ pressed: false }) : action.props.style)
    expect(style).toMatchObject({ backgroundColor: 'transparent', opacity: 1 })
    expect(hosts(action, 'skeleton-face')).toHaveLength(1)
    expect(texts(root)).not.toContain('common.loading')
    expectNoSpinner(root)
  })

  it('dims an unavailable proactive action and explains it without a skeleton face', () => {
    mocks.reason = 'shell.composer.offline.reason'
    const root = render(<ProactiveAction item={createMockProactiveItem()} acted={false} isOnline={false} onSend={vi.fn()} />)
    const action = root.findAll((node) => typeof node.type === 'string' && node.props.accessibilityRole === 'button')[0]!
    expect(action.props.accessibilityState).toEqual({ disabled: true, busy: false })
    const style = StyleSheet.flatten(typeof action.props.style === 'function' ? action.props.style({ pressed: false }) : action.props.style)
    expect(style).toMatchObject({ backgroundColor: tokens.bgWell, opacity: 0.5 })
    expect(hosts(action, 'skeleton-face')).toHaveLength(0)
    expect(action.props.accessibilityHint).toBeTruthy()
  })
})

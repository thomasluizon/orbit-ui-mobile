import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { PortalHost } from '@rn-primitives/portal'
import { ThrottleScreen } from '@/components/throttle-screen'
import { OverlayHost } from '@/components/ui/overlay-host'
import { useThrottleStore } from '@/stores/throttle-store'
import { useVersionGateStore } from '@/stores/version-gate-store'
import { useUIStore } from '@/stores/ui-store'

const { refetch } = vi.hoisted(() => ({ refetch: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/query-client', () => ({ queryClient: { refetchQueries: refetch } }))

let tree: ReactTestRenderer
beforeEach(() => {
  useThrottleStore.getState().clear()
  expect(useThrottleStore.getState().show(429, { retryAfterUtc: new Date(Date.now() - 1000).toISOString() })).toBe(true)
  useVersionGateStore.setState({ upgradeRequired: false })
  useUIStore.setState({ openOverlayIds: [] })
  refetch.mockClear()
})
afterEach(async () => { await act(() => tree.update(<></>)) })

it('presents the request blocker through the native window and keeps Back blocked until retry', async () => {
  await act(() => { tree = create(<OverlayHost><ThrottleScreen /></OverlayHost>) })
  const window = tree.root.findAll((node) => typeof node.type === 'string' && String(node.type) === 'Modal' && node.props.visible === true)[0]!
  expect(window.props).toMatchObject({ transparent: true, statusBarTranslucent: true, navigationBarTranslucent: true })
  const host = window.findAll((node) => node.type === PortalHost).find((node) => typeof node.props.name === 'string')!
  expect(host).toBeDefined()
  expect(host.findAll((node) => typeof node.type === 'string' && node.props.role === 'dialog')).toHaveLength(1)
  await act(() => (window.props.onRequestClose as () => void)())
  expect(window.props.visible).toBe(true)
  expect(useThrottleStore.getState().error).not.toBeNull()
  const retry = tree.root.findAll((node) => typeof node.type === 'string' && node.props.accessibilityRole === 'button')[0]!
  await act(() => (retry.props.onPress as () => void)())
  expect(useThrottleStore.getState().error).toBeNull()
  expect(refetch).toHaveBeenCalledWith({ type: 'active' })
  expect(tree.root.findAll((node) => typeof node.type === 'string' && String(node.type) === 'Modal' && node.props.visible === true)).toHaveLength(0)
})

it('gives the required upgrade priority over a pending throttle', async () => {
  useVersionGateStore.setState({ upgradeRequired: true })
  await act(() => { tree = create(<OverlayHost><ThrottleScreen /></OverlayHost>) })
  expect(tree.root.findAll((node) => typeof node.type === 'string' && String(node.type) === 'Modal' && node.props.visible === true)).toHaveLength(0)
  expect(tree.root.findAll((node) => typeof node.type === 'string' && node.props.role === 'dialog')).toHaveLength(0)
})

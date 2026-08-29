import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DestinationShell } from '@/components/shell/destination-shell'

const mocks = vi.hoisted(() => ({
  closeSheet: vi.fn(),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}))
vi.mock('@/lib/theme', () => ({
  createTokensV2: () => ({ bg: '#111111', hairline: '#222222' }),
}))
vi.mock('@/lib/use-app-theme', () => ({
  useAppTheme: () => ({ currentScheme: 'purple', currentTheme: 'dark' }),
}))
vi.mock('@/components/shell/shell-composer', () => ({
  ShellComposer: ({ onOpenConversation }: { onOpenConversation: () => void }) =>
    React.createElement('ShellComposer', { onOpenConversation }),
}))
vi.mock('@/app/chat', () => ({
  ChatScreenContent: ({ onClose }: { onClose: () => void }) =>
    React.createElement('ChatScreenContent', { onClose }),
}))
vi.mock('@/components/ui/sheet', () => ({
  useSheetHost: () => ({
    sheetRef: { current: null },
    closeSheet: (exitAction?: () => void) => {
      mocks.closeSheet(exitAction)
      exitAction?.()
    },
  }),
  Sheet: ({ children, onClose }: { children: React.ReactNode; onClose: () => void }) =>
    React.createElement('Sheet', { onClose }, children),
}))

const TestRenderer: typeof import('react-test-renderer') = require('react-test-renderer')
type ReactTestRenderer = import('react-test-renderer').ReactTestRenderer

async function renderShell(pathname: string, props: { nav?: false; notice?: React.ReactNode } = {}) {
  let tree!: ReactTestRenderer
  await TestRenderer.act(() => {
    tree = TestRenderer.create(
      props.nav === false ? (
        <DestinationShell nav={false} pathname={pathname} notice={props.notice}>
          {React.createElement('Screen')}
        </DestinationShell>
      ) : (
        <DestinationShell
          pathname={pathname}
          notice={props.notice}
          tabBar={React.createElement('TabBar')}
        >
          {React.createElement('Screen')}
        </DestinationShell>
      ),
    )
  })
  return tree
}

function hosts(tree: ReactTestRenderer, type: string) {
  return tree.root.findAll((node) => node.type === type)
}

function hostCallback(tree: ReactTestRenderer, type: string, name: string) {
  const props = hosts(tree, type)[0]?.props
  const callback = props?.[name]
  if (typeof callback !== 'function') throw new TypeError(`${type}.${name} is not callable`)
  return () => callback()
}

describe('mobile DestinationShell', () => {
  beforeEach(() => {
    mocks.closeSheet.mockReset()
  })

  it.each(['/', '/calendar', '/progress', '/profile'])('mounts the composer at %s', async (pathname) => {
    const tree = await renderShell(pathname)

    expect(hosts(tree, 'ShellComposer')).toHaveLength(1)
  })

  it('does not mount the composer on a flow or pushed screen', async () => {
    const flow = await renderShell('/chat', { nav: false })
    const pushed = await renderShell('/preferences')

    expect(hosts(flow, 'ShellComposer')).toHaveLength(0)
    expect(hosts(pushed, 'ShellComposer')).toHaveLength(0)
  })

  it('opens the conversation from the Astra trigger and closes it through the sheet host', async () => {
    const tree = await renderShell('/')

    await TestRenderer.act(() => hostCallback(tree, 'ShellComposer', 'onOpenConversation')())
    expect(hosts(tree, 'ChatScreenContent')).toHaveLength(1)
    await TestRenderer.act(() => hostCallback(tree, 'ChatScreenContent', 'onClose')())

    expect(mocks.closeSheet).toHaveBeenCalledOnce()
    expect(hosts(tree, 'ChatScreenContent')).toHaveLength(0)
  })

  it('keeps the composer mounted when a notice is present', async () => {
    const tree = await renderShell('/', { notice: React.createElement('Notice') })

    expect(hosts(tree, 'Notice')).toHaveLength(1)
    expect(hosts(tree, 'ShellComposer')).toHaveLength(1)
  })
})

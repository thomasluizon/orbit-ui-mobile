import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DestinationShell } from '@/components/shell/destination-shell'
import { useChatComposer } from '@/hooks/use-chat-composer'

const mocks = vi.hoisted(() => ({
  closeSheet: vi.fn(),
  showSendControl: false,
  draft: '',
  nextControllerId: 0,
  liveControllers: new Set<number>(),
  statefulScreenMounts: 0,
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
vi.mock('@/hooks/use-offline', () => ({ useOffline: () => ({ isOnline: true }) }))
vi.mock('@/hooks/use-chat-composer', async () => {
  const { useEffect, useRef, useState } = await import('react')
  return {
    useChatComposer: ({ onOpenConversation }: { onOpenConversation?: () => void }) => {
      const controllerId = useRef(mocks.nextControllerId++)
      const [input, setInput] = useState(mocks.draft)
      const [sendError, setSendError] = useState<string | null>(null)

      useEffect(() => {
        const id = controllerId.current
        mocks.liveControllers.add(id)
        return () => {
          mocks.liveControllers.delete(id)
        }
      }, [])

      const setDraft = (value: string) => {
        mocks.draft = value
        setInput(value)
      }

      return {
        sendError,
        composerProps: {
          value: input,
          onChangeValue: setDraft,
          onOpenConversation,
          onSend: () => {
            if (onOpenConversation && mocks.showSendControl) {
              onOpenConversation()
              setSendError('send failed sentinel')
              return
            }
            setDraft('')
          },
          ...(sendError ? { onRetry: () => setSendError(null) } : {}),
        },
      }
    },
  }
})
vi.mock('@/components/shell/shell-composer', () => ({
  ShellComposer: ({
    composer,
  }: {
    composer: {
      composerProps: {
        value: string
        onChangeValue: (value: string) => void
        onOpenConversation?: () => void
        onSend: () => void
      }
    }
  }) => React.createElement('ShellComposer', {
    value: composer.composerProps.value,
    onChangeValue: composer.composerProps.onChangeValue,
    onOpenConversation: composer.composerProps.onOpenConversation,
    onSend: composer.composerProps.onSend,
  }),
}))
vi.mock('@/app/chat', () => ({
  ChatScreenContent: ({
    composer,
    onClose,
  }: {
    composer: {
      sendError: string | null
      composerProps: { onRetry?: () => void }
    }
    onClose: () => void
  }) => React.createElement(
    React.Fragment,
    null,
    React.createElement('ChatScreenContent', { onClose }),
    composer.sendError
      ? React.createElement('Text', { accessibilityRole: 'alert' }, composer.sendError)
      : null,
    composer.composerProps.onRetry
      ? React.createElement('Pressable', {
          accessibilityLabel: 'retry send',
          onPress: composer.composerProps.onRetry,
        })
      : null,
  ),
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

function ChatRouteComposer() {
  const composer = useChatComposer({ isOnline: true })
  return React.createElement('RouteComposer', {
    value: composer.composerProps.value,
    onSend: composer.composerProps.onSend,
  })
}

function StatefulScreen() {
  const [value, setValue] = React.useState('initial state')

  React.useEffect(() => {
    mocks.statefulScreenMounts += 1
  }, [])

  return React.createElement('StatefulScreen', { value, setValue })
}

function hostCallback(tree: ReactTestRenderer, type: string, name: string) {
  const props = hosts(tree, type)[0]?.props
  const callback = props?.[name]
  if (typeof callback !== 'function') throw new TypeError(`${type}.${name} is not callable`)
  return () => callback()
}

function hostStringCallback(tree: ReactTestRenderer, type: string, name: string) {
  const props = hosts(tree, type)[0]?.props
  const callback = props?.[name]
  if (typeof callback !== 'function') throw new TypeError(`${type}.${name} is not callable`)
  return (value: string) => callback(value)
}

describe('mobile DestinationShell', () => {
  beforeEach(() => {
    mocks.closeSheet.mockReset()
    mocks.showSendControl = false
    mocks.draft = ''
    mocks.nextControllerId = 0
    mocks.liveControllers.clear()
    mocks.statefulScreenMounts = 0
  })

  it.each(['/', '/calendar', '/progress', '/profile'])('mounts the composer at %s', async (pathname) => {
    const tree = await renderShell(pathname)

    expect(hosts(tree, 'ShellComposer')).toHaveLength(1)
  })

  it('does not mount the composer on a flow or pushed screen', async () => {
    const flow = await renderShell('/chat', { nav: false })
    expect(mocks.liveControllers.size).toBe(0)
    const pushed = await renderShell('/preferences')

    expect(hosts(flow, 'ShellComposer')).toHaveLength(0)
    expect(hosts(pushed, 'ShellComposer')).toHaveLength(0)
  })

  it('clears a shell draft sent from the chat route before returning', async () => {
    const tree = await renderShell('/')

    await TestRenderer.act(() => {
      hostStringCallback(tree, 'ShellComposer', 'onChangeValue')('draft to send')
    })
    expect(mocks.liveControllers.size).toBe(1)

    await TestRenderer.act(() => {
      tree.update(
        <DestinationShell nav={false} pathname="/chat">
          <ChatRouteComposer />
        </DestinationShell>,
      )
    })
    expect(mocks.liveControllers.size).toBe(1)
    expect(hosts(tree, 'RouteComposer')[0]?.props.value).toBe('draft to send')

    await TestRenderer.act(() => hostCallback(tree, 'RouteComposer', 'onSend')())
    await TestRenderer.act(() => {
      tree.update(
        <DestinationShell pathname="/" tabBar={React.createElement('TabBar')}>
          {React.createElement('Screen')}
        </DestinationShell>,
      )
    })

    expect(mocks.liveControllers.size).toBe(1)
    expect(hosts(tree, 'ShellComposer')[0]?.props.value).toBe('')
  })

  it('restores a genuinely unsent draft after visiting the chat route', async () => {
    const tree = await renderShell('/')

    await TestRenderer.act(() => {
      hostStringCallback(tree, 'ShellComposer', 'onChangeValue')('keep this draft')
      tree.update(
        <DestinationShell nav={false} pathname="/chat">
          <ChatRouteComposer />
        </DestinationShell>,
      )
    })
    await TestRenderer.act(() => {
      tree.update(
        <DestinationShell pathname="/" tabBar={React.createElement('TabBar')}>
          {React.createElement('Screen')}
        </DestinationShell>,
      )
    })

    expect(mocks.liveControllers.size).toBe(1)
    expect(hosts(tree, 'ShellComposer')[0]?.props.value).toBe('keep this draft')
  })

  it('keeps stateful route content mounted while navigation chrome toggles', async () => {
    let tree!: ReactTestRenderer
    await TestRenderer.act(() => {
      tree = TestRenderer.create(
        <DestinationShell pathname="/" tabBar={React.createElement('TabBar')}>
          <StatefulScreen />
        </DestinationShell>,
      )
    })

    await TestRenderer.act(() => {
      hostStringCallback(tree, 'StatefulScreen', 'setValue')('retained state')
    })
    await TestRenderer.act(() => {
      tree.update(
        <DestinationShell nav={false} pathname="/chat">
          <StatefulScreen />
        </DestinationShell>,
      )
    })

    expect(mocks.liveControllers.size).toBe(0)
    expect(mocks.statefulScreenMounts).toBe(1)
    expect(hosts(tree, 'StatefulScreen')[0]?.props.value).toBe('retained state')

    await TestRenderer.act(() => {
      tree.update(
        <DestinationShell pathname="/" tabBar={React.createElement('TabBar')}>
          <StatefulScreen />
        </DestinationShell>,
      )
    })

    expect(mocks.liveControllers.size).toBe(1)
    expect(mocks.statefulScreenMounts).toBe(1)
    expect(hosts(tree, 'StatefulScreen')[0]?.props.value).toBe('retained state')
  })

  it('opens the conversation from the Astra trigger and closes it through the sheet host', async () => {
    const tree = await renderShell('/')

    await TestRenderer.act(() => hostCallback(tree, 'ShellComposer', 'onOpenConversation')())
    expect(hosts(tree, 'ChatScreenContent')).toHaveLength(1)
    await TestRenderer.act(() => hostCallback(tree, 'ChatScreenContent', 'onClose')())

    expect(mocks.closeSheet).toHaveBeenCalledOnce()
    expect(hosts(tree, 'ChatScreenContent')).toHaveLength(0)
  })

  it('shows a failed shell send and retry inside the opened conversation', async () => {
    mocks.showSendControl = true
    const tree = await renderShell('/')

    await TestRenderer.act(() => hostCallback(tree, 'ShellComposer', 'onSend')())

    expect(hosts(tree, 'Text').some((node) => node.props.children === 'send failed sentinel'))
      .toBe(true)
    const retry = hosts(tree, 'Pressable').find(
      (node) => node.props.accessibilityLabel === 'retry send',
    )
    expect(retry).toBeDefined()
    const retrySend = retry?.props.onPress
    if (typeof retrySend !== 'function') throw new TypeError('Expected retry send to be callable')
    await TestRenderer.act(() => retrySend())
    expect(hosts(tree, 'Text').some((node) => node.props.children === 'send failed sentinel'))
      .toBe(false)
  })

  it('keeps the composer mounted when a notice is present', async () => {
    const tree = await renderShell('/', { notice: React.createElement('Notice') })

    expect(hosts(tree, 'Notice')).toHaveLength(1)
    expect(hosts(tree, 'ShellComposer')).toHaveLength(1)
  })
})

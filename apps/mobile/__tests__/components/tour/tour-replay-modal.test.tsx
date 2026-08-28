import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TourReplayModal } from '@/components/tour/tour-replay-modal'
import { sheetTestControls } from '@/__tests__/support/sheet-double'

const TestRenderer = require('react-test-renderer')

const mocks = vi.hoisted(() => ({
  apiClient: vi.fn(() => Promise.resolve(undefined)),
  setQueryData: vi.fn(),
  startFullTour: vi.fn(),
  startSectionReplay: vi.fn(),
}))

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(() => Promise.resolve(null)),
    setItem: vi.fn(() => Promise.resolve()),
  },
}))

vi.mock('@/lib/theme', () => ({
  createTokensV2: () => new Proxy({}, { get: () => '#111111' }),
  radius: new Proxy({}, { get: () => 12 }),
}))

vi.mock('@/components/ui/icons', () => {
  const React = require('react')
  const createIcon = (name: string) => (props: any) => React.createElement(name, props)
  return {
    CheckCircle: createIcon('CheckCircle'),
    Target: createIcon('Target'),
    MessageCircle: createIcon('MessageCircle'),
    CalendarDays: createIcon('CalendarDays'),
    User: createIcon('User'),
    Play: createIcon('Play'),
  }
})

vi.mock('@/lib/api-client', () => ({
  apiClient: (...args: unknown[]) => mocks.apiClient(...(args as [])),
}))

vi.mock('@/stores/tour-store', () => ({
  useTourStore: () => ({
    startFullTour: mocks.startFullTour,
    startSectionReplay: mocks.startSectionReplay,
  }),
}))

vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({ profile: { hasProAccess: true } }),
}))

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ setQueryData: mocks.setQueryData }),
}))

function render(onClose = vi.fn()) {
  let tree: any
  TestRenderer.act(() => {
    tree = TestRenderer.create(
      React.createElement(TourReplayModal, { visible: true, onClose }),
    )
  })
  return { tree, onClose }
}

function sheetCount(tree: any) {
  return tree.root.findAllByType('Sheet').length
}

function pressReplayAll(tree: any) {
  const pill = tree.root
    .findAll(
      (node: any) =>
        typeof node.props?.onClick === 'function' &&
        node.findAll(
          (child: any) =>
            child.type === 'Text' && child.props.children === 'tour.replay.replayAll',
        ).length > 0,
    )
    .at(-1)
  if (!pill) throw new Error('Replay all action not found')
  TestRenderer.act(() => {
    pill.props.onClick()
  })
}

function pressSection(tree: any, section: string) {
  const row = tree.root
    .findAll(
      (node: any) =>
        typeof node.props?.onPress === 'function' &&
        node.props?.accessibilityRole === 'button' &&
        node.findAll(
          (child: any) =>
            child.type === 'Text' && child.props.children === `tour.sections.${section}`,
        ).length > 0,
    )
    .at(-1)
  if (!row) throw new Error(`Section row not found: ${section}`)
  TestRenderer.act(() => {
    row.props.onPress()
  })
}

/**
 * Replay all used to start the tour from outside the completed dismissal, so an
 * immediate reset failure could raise the overlay while TrueSheet was still
 * presented. Every action here has to wait for the native dismissal.
 */
describe('TourReplayModal close path', () => {
  beforeEach(() => {
    mocks.apiClient.mockReset()
    mocks.apiClient.mockImplementation(() => Promise.resolve(undefined))
    mocks.setQueryData.mockReset()
    mocks.startFullTour.mockReset()
    mocks.startSectionReplay.mockReset()
    sheetTestControls.defer(true)
  })

  afterEach(() => {
    sheetTestControls.defer(false)
  })

  it('starts the full tour only once the dismissal completes', () => {
    const { tree, onClose } = render()
    expect(sheetCount(tree)).toBe(1)

    pressReplayAll(tree)

    expect(sheetTestControls.isDismissPending).toBe(true)
    expect(mocks.startFullTour).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()

    TestRenderer.act(() => {
      sheetTestControls.completeDismissal()
    })

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(mocks.startFullTour).toHaveBeenCalledTimes(1)
  })

  it('starts the full tour even when the reset request never settles', () => {
    mocks.apiClient.mockImplementation(() => new Promise(() => {}))
    const { tree } = render()

    pressReplayAll(tree)
    TestRenderer.act(() => {
      sheetTestControls.completeDismissal()
    })

    expect(mocks.startFullTour).toHaveBeenCalledTimes(1)
  })

  it('holds the full tour behind the dismissal even when the reset rejects at once', async () => {
    mocks.apiClient.mockImplementation(() => Promise.reject(new Error('offline')))
    const { tree } = render()

    pressReplayAll(tree)
    await Promise.resolve()

    expect(mocks.startFullTour).not.toHaveBeenCalled()

    TestRenderer.act(() => {
      sheetTestControls.completeDismissal()
    })
    await Promise.resolve()

    expect(mocks.startFullTour).toHaveBeenCalledTimes(1)
  })

  it('never resets tour progress before the dismissal completes', () => {
    const { tree } = render()

    pressReplayAll(tree)

    expect(mocks.apiClient).not.toHaveBeenCalled()
    expect(mocks.setQueryData).not.toHaveBeenCalled()

    TestRenderer.act(() => {
      sheetTestControls.completeDismissal()
    })

    expect(mocks.setQueryData).toHaveBeenCalledTimes(1)
    expect(mocks.apiClient).toHaveBeenCalledTimes(1)
  })

  it('starts a section replay only once the dismissal completes', () => {
    const { tree, onClose } = render()

    pressSection(tree, 'habits')

    expect(sheetTestControls.isDismissPending).toBe(true)
    expect(mocks.startSectionReplay).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()

    TestRenderer.act(() => {
      sheetTestControls.completeDismissal()
    })

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(mocks.startSectionReplay).toHaveBeenCalledWith('habits')
  })
})

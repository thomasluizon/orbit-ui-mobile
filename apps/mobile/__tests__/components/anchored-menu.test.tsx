import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { Animated } from '../../test-mocks/react-native'
import { AnchoredMenu, useAnchoredMenu, type AnchoredMenuController } from '@/components/ui/anchored-menu'

const TestRenderer: typeof import('react-test-renderer') = require('react-test-renderer')

describe('AnchoredMenu', () => {
  it('keeps an immediately opened menu mounted through pending animation updates', () => {
    const callbacks: ((result: { finished: boolean }) => void)[] = []
    const timing = vi.spyOn(Animated, 'timing').mockImplementation(() => ({
      start: (callback?: (result: { finished: boolean }) => void) => {
        if (callback) callbacks.push(callback)
      },
      stop: () => {},
    }))
    const props = {
      anchorRect: null, onClose: vi.fn(), onCloseComplete: vi.fn(),
      openRevision: 0, children: React.createElement('Item'),
    }
    let root: {
      update: (element: React.ReactElement) => void
      root: { findAllByType: (type: string) => unknown[] }
    }

    try {
      void TestRenderer.act(() => {
        root = TestRenderer.create(<AnchoredMenu {...props} visible={false} isClosing={false} />) as typeof root
      })
      expect(callbacks).toHaveLength(0)
      void TestRenderer.act(() => {
        root.update(<AnchoredMenu {...props} visible isClosing={false} openRevision={1} />)
      })
      expect(root!.root.findAllByType('Modal')).toHaveLength(1)
      void TestRenderer.act(() => {
        for (const callback of callbacks) callback({ finished: true })
      })
      expect(root!.root.findAllByType('Modal')).toHaveLength(1)
    } finally {
      timing.mockRestore()
    }
  })

  it('remounts the native dialog on each open and ignores an old close callback', () => {
    const callbacks: ((result: { finished: boolean }) => void)[] = []
    const timing = vi.spyOn(Animated, 'timing').mockImplementation(() => ({
      start: (callback?: (result: { finished: boolean }) => void) => {
        if (callback) callbacks.push(callback)
      },
      stop: () => {},
    }))
    let controller: AnchoredMenuController
    function Harness() {
      controller = useAnchoredMenu()
      return <AnchoredMenu
        visible={controller.visible}
        isClosing={controller.isClosing}
        openRevision={controller.openRevision}
        anchorRect={controller.anchorRect}
        onClose={controller.close}
        onCloseComplete={controller.finishClose}
      ><Item /></AnchoredMenu>
    }
    function Item() { return null }
    let root: { root: { findAllByType: (type: string) => unknown[] } }
    try {
      void TestRenderer.act(() => { root = TestRenderer.create(<Harness />) as unknown as typeof root })
      void TestRenderer.act(() => controller!.open())
      const first = root!.root.findAllByType('Modal')[0]
      void TestRenderer.act(() => controller!.open())
      const second = root!.root.findAllByType('Modal')[0]
      expect(second).not.toBe(first)
      void TestRenderer.act(() => controller!.toggle())
      expect(root!.root.findAllByType('Modal')[0]).not.toBe(second)
      void TestRenderer.act(() => controller!.close())
      expect(root!.root.findAllByType('Modal')).toHaveLength(1)
      void TestRenderer.act(() => controller!.open())
      void TestRenderer.act(() => {
        for (const callback of callbacks) callback({ finished: true })
      })
      expect(root!.root.findAllByType('Modal')).toHaveLength(1)
    } finally {
      timing.mockRestore()
    }
  })
})

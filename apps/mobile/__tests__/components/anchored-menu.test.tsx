import React from 'react'
import { Pressable } from 'react-native'
import { describe, expect, it, vi } from 'vitest'
import { Animated } from '../../test-mocks/react-native'
import { AnchoredMenu, useAnchoredMenu, type AnchoredMenuController } from '@/components/ui/anchored-menu'

const TestRenderer: typeof import('react-test-renderer') = require('react-test-renderer')

describe('AnchoredMenu', () => {
  it('closes another row menu when a second row opens its menu', () => {
    const controllers: AnchoredMenuController[] = []
    function RowMenu({ index }: { index: number }) {
      const controller = useAnchoredMenu()
      controllers[index] = controller
      return <><Pressable accessibilityLabel={`Row ${index} menu`} onPress={controller.open} /><AnchoredMenu
        visible={controller.visible}
        isClosing={controller.isClosing}
        openRevision={controller.openRevision}
        anchorRect={controller.anchorRect}
        onClose={controller.close}
        onCloseComplete={controller.finishClose}
      ><Item /></AnchoredMenu></>
    }
    function Item() { return null }
    let root: {
      root: {
        findAllByType: (type: string) => {
          props: {
            visible?: boolean
            accessibilityElementsHidden?: boolean
            accessibilityLabel?: string
            onPress?: () => void
          }
        }[]
      }
    }
    void TestRenderer.act(() => {
      root = TestRenderer.create(<><RowMenu index={0} /><RowMenu index={1} /></>) as unknown as typeof root
    })
    const presentedDialogs = () => root!.root.findAllByType('Modal').filter((modal) => modal.props.visible)
    const activeBackdrops = () => root!.root.findAllByType('Pressable').filter(
      (pressable) => pressable.props.accessibilityElementsHidden === true,
    )
    expect(presentedDialogs()).toHaveLength(0)
    expect(activeBackdrops()).toHaveLength(0)
    const triggers = root!.root.findAllByType('Pressable').filter(
      (pressable) => typeof pressable.props.accessibilityLabel === 'string',
    )
    void TestRenderer.act(() => triggers[0]!.props.onPress?.())
    expect(controllers[0]!.visible).toBe(true)
    expect(presentedDialogs()).toHaveLength(1)
    expect(activeBackdrops()).toHaveLength(1)
    void TestRenderer.act(() => triggers[1]!.props.onPress?.())
    expect(controllers[0]!.visible).toBe(false)
    expect(controllers[1]!.visible).toBe(true)
    expect(presentedDialogs()).toHaveLength(1)
    expect(activeBackdrops()).toHaveLength(1)
  })

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

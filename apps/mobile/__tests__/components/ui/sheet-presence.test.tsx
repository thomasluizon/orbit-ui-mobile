import React from 'react'
import { Text } from 'react-native'
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TrueSheet } from '@/__tests__/support/native-sheet-double'
import { Sheet } from '@/components/ui/sheet'
import { useSheetPresence } from '@/components/ui/sheet-presence'

vi.unmock('@/components/ui/sheet')
vi.mock('@lodev09/react-native-true-sheet', async () => import('@/__tests__/support/native-sheet-double'))

let tree: ReactTestRenderer
afterEach(async () => {
  await act(() => tree.update(<></>))
})

function PresentedNotice({ open, onClose }: Readonly<{ open: boolean; onClose: () => void }>) {
  const { mounted, sheetKey, sheetRef } = useSheetPresence(open)
  if (!mounted) return null
  return <Sheet key={sheetKey} ref={sheetRef} title="Notice" onClose={onClose}><Text>Body</Text></Sheet>
}

function nativeSheets() {
  return tree.root.findAll(node => node.type === TrueSheet) as (ReactTestInstance & { instance: TrueSheet })[]
}

/** Holds the native dismissal open, the way UIKit animates a sheet out before it reports the dismissal. */
function holdDismissal(sheet: TrueSheet) {
  let finish!: () => void
  const dismiss = vi.fn(() => new Promise<void>((resolve) => {
    finish = () => {
      sheet.props.onDidDismiss?.({ nativeEvent: null } as never)
      resolve()
    }
  }))
  sheet.dismiss = dismiss
  return { dismiss, finish: () => finish() }
}

async function settle() {
  await act(async () => { await Promise.resolve() })
}

describe('useSheetPresence with the native sheet', () => {
  it('dismisses a presented sheet natively before it unmounts when its open state turns false', async () => {
    const onClose = vi.fn()
    await act(() => { tree = create(<PresentedNotice open onClose={onClose} />) })
    await settle()
    const presented = nativeSheets()[0]!.instance
    const held = holdDismissal(presented)

    await act(() => tree.update(<PresentedNotice open={false} onClose={onClose} />))

    expect(held.dismiss).toHaveBeenCalledOnce()
    expect(nativeSheets()).toHaveLength(1)

    await act(async () => {
      held.finish()
      await Promise.resolve()
    })

    expect(nativeSheets()).toHaveLength(0)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('unmounts without a second dismissal after the person swipes the sheet away', async () => {
    let open = true
    const onClose = vi.fn(() => { open = false })
    await act(() => { tree = create(<PresentedNotice open={open} onClose={onClose} />) })
    await settle()
    const presented = nativeSheets()[0]!.instance
    const dismiss = vi.spyOn(presented, 'dismiss')

    await act(() => presented.attempt('swipe down'))
    await act(() => tree.update(<PresentedNotice open={open} onClose={onClose} />))

    expect(onClose).toHaveBeenCalledOnce()
    expect(dismiss).toHaveBeenCalledOnce()
    expect(nativeSheets()).toHaveLength(0)
  })

  it('mounts a fresh native sheet when the open state returns during a dismissal', async () => {
    const onClose = vi.fn()
    await act(() => { tree = create(<PresentedNotice open onClose={onClose} />) })
    await settle()
    const previous = nativeSheets()[0]!.instance
    const held = holdDismissal(previous)

    await act(() => tree.update(<PresentedNotice open={false} onClose={onClose} />))
    await act(() => tree.update(<PresentedNotice open onClose={onClose} />))
    expect(nativeSheets()[0]!.instance).toBe(previous)

    await act(async () => {
      held.finish()
      await Promise.resolve()
    })

    expect(nativeSheets()).toHaveLength(1)
    expect(nativeSheets()[0]!.instance).not.toBe(previous)
  })
})

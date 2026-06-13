import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useOverlayBack } from '@/hooks/use-overlay-back'
import { dismissTopOverlay } from '@/lib/overlay-stack'

const TestRenderer = require('react-test-renderer')

type Root = { unmount: () => void }

const mountedRoots: Root[] = []

function Layer({ active, onDismiss }: Readonly<{ active: boolean; onDismiss: () => void }>) {
  useOverlayBack(active, onDismiss)
  return null
}

async function renderTree(element: React.ReactElement): Promise<Root> {
  let root: Root | null = null
  await TestRenderer.act(async () => {
    root = TestRenderer.create(element)
    await Promise.resolve()
  })
  const created = root as unknown as Root
  mountedRoots.push(created)
  return created
}

afterEach(async () => {
  await TestRenderer.act(async () => {
    while (mountedRoots.length > 0) {
      mountedRoots.pop()?.unmount()
    }
    await Promise.resolve()
  })
})

describe('mobile useOverlayBack', () => {
  it('makes system back dismiss the registered layer and return true', async () => {
    const onDismiss = vi.fn()
    await renderTree(<Layer active onDismiss={onDismiss} />)

    expect(dismissTopOverlay('system-back')).toBe(true)
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('resolves the most recently registered layer first (LIFO)', async () => {
    const lower = vi.fn()
    const upper = vi.fn()
    await renderTree(
      <>
        <Layer active onDismiss={lower} />
        <Layer active onDismiss={upper} />
      </>,
    )

    expect(dismissTopOverlay('system-back')).toBe(true)
    expect(upper).toHaveBeenCalledTimes(1)
    expect(lower).not.toHaveBeenCalled()
  })

  it('unregisters on unmount so back falls through again', async () => {
    const onDismiss = vi.fn()
    const root = await renderTree(<Layer active onDismiss={onDismiss} />)

    await TestRenderer.act(async () => {
      root.unmount()
      await Promise.resolve()
    })

    expect(dismissTopOverlay('system-back')).toBe(false)
    expect(onDismiss).not.toHaveBeenCalled()
  })

  it('does not register while inactive', async () => {
    const onDismiss = vi.fn()
    await renderTree(<Layer active={false} onDismiss={onDismiss} />)

    expect(dismissTopOverlay('system-back')).toBe(false)
    expect(onDismiss).not.toHaveBeenCalled()
  })
})

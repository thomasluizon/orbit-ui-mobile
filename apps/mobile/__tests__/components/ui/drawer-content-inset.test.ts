import { describe, expect, it, vi } from 'vitest'
import type { ViewStyle } from 'react-native'

const rnMocks = vi.hoisted(() => {
  function flatten(style: unknown): Record<string, unknown> {
    if (!style) return {}
    if (Array.isArray(style)) {
      return style.reduce<Record<string, unknown>>(
        (accumulated, item) => Object.assign(accumulated, flatten(item)),
        {},
      )
    }
    return style as Record<string, unknown>
  }
  return { flatten }
})

vi.mock('react-native', () => ({
  StyleSheet: { flatten: rnMocks.flatten },
}))

async function loadModule() {
  return import('@/components/ui/drawer-content-inset')
}

function insetPaddingBottom(result: unknown): number {
  const layers = result as Array<{ paddingBottom?: number } | undefined>
  const last = layers.at(-1)
  return last?.paddingBottom ?? Number.NaN
}

describe('withDrawerContentInset', () => {
  it('exposes the fixed bottom inset constant', async () => {
    const { DRAWER_CONTENT_BOTTOM_INSET } = await loadModule()
    expect(DRAWER_CONTENT_BOTTOM_INSET).toBe(128)
  })

  it('adds the inset on top of an existing numeric paddingBottom', async () => {
    const { withDrawerContentInset } = await loadModule()
    const style: ViewStyle = { paddingBottom: 20 }

    const result = withDrawerContentInset(style)

    expect(insetPaddingBottom(result)).toBe(148)
    expect((result as unknown[])[0]).toBe(style)
  })

  it('uses the inset alone when no style is provided', async () => {
    const { withDrawerContentInset } = await loadModule()

    expect(insetPaddingBottom(withDrawerContentInset())).toBe(128)
  })

  it('treats a non-numeric paddingBottom as zero', async () => {
    const { withDrawerContentInset } = await loadModule()

    const style: ViewStyle = { paddingBottom: '10%' }

    expect(insetPaddingBottom(withDrawerContentInset(style))).toBe(128)
  })

  it('flattens an array style before reading paddingBottom', async () => {
    const { withDrawerContentInset } = await loadModule()

    const result = withDrawerContentInset([{ paddingBottom: 8 }, { margin: 4 }])

    expect(insetPaddingBottom(result)).toBe(136)
  })
})

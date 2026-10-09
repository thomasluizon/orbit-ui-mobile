import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { StyleSheet, Pressable } from 'react-native'
import { describe, expect, it } from 'vitest'
import { ListRow } from '@/components/ui/list-row'
import { measureProfileRow } from '../../support/profile-row-geometry'

describe('shared row geometry', () => {
  it.each([412, 840].flatMap((width) => [1, 2].map((scale) => ({ width, scale }))))('owns the row padding at $width and $scale', async ({ width, scale }) => {
    let tree!: ReactTestRenderer & { toJSON: () => Parameters<typeof measureProfileRow>[0] }
    await act(() => { tree = create(<ListRow title="Tags" value="3" onClick={() => {}} />) as typeof tree })
    try {
      const body = tree.root.findAll((node) => node.type === Pressable)[0]!
      const style = StyleSheet.flatten((body.props.style as (state: { pressed: boolean }) => object)({ pressed: false }))
      expect(style).toMatchObject({ minHeight: 52, paddingHorizontal: 16, paddingVertical: 12 })
      const geometry = measureProfileRow(tree.toJSON(), width, scale)
      expect(geometry.controls[0]!.inlineClearance).toBe(16)
      expect(geometry.texts.find((text) => text.label === 'Tags')!.left).toBe(16)
      if (scale === 2) expect(geometry.height).toBeGreaterThan(52)
    } finally { await act(() => tree.update(<></>)) }
  })
})

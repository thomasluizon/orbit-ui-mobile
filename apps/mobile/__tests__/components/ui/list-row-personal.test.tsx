import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { describe, expect, it, vi } from 'vitest'
import { ListRow } from '@/components/ui/list-row'

describe('personal account row', () => {
  it('keeps a long email on one line with tail ellipsis and the full accessible name', async () => {
    const email = `${'longaddress'.repeat(12)}@example.com`
    const onOpen = vi.fn()
    let tree!: ReactTestRenderer
    await act(() => { tree = create(<ListRow title="Account" description={email} textMode="personal" accessibilityLabel={`Account ${email}`} onClick={onOpen} />) })
    const text = tree.root.findAll((node) => node.type === 'Text' && node.props.children === email)
    expect(text).toHaveLength(1)
    expect(text[0]!.props).toMatchObject({ numberOfLines: 1, ellipsizeMode: 'tail' })
    const row = tree.root.findAll((node) => node.type === 'Pressable' && node.props.accessibilityRole === 'button')[0]!
    expect(row.props.accessibilityLabel).toContain(email)
    await act(() => { row.props.onPress() })
    expect(onOpen).toHaveBeenCalledOnce()
    await act(() => tree.unmount())
  })
})

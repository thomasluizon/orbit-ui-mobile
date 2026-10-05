import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { describe, expect, it, vi } from 'vitest'
import { ListRow } from '@/components/ui/list-row'

describe('personal account row', () => {
  it('repairs measured breaks inside a word and retains two visible lines', async () => {
    const title = 'Ler palavraMuitoLonga todos os dias'
    const measured = ['Ler palavra', 'MuitoLonga ', 'todos os dias']
    let tree!: ReactTestRenderer
    await act(() => { tree = create(<ListRow title={title} textMode="personal" onClick={vi.fn()} />) })
    const probe = tree.root.findAll((node) => String(node.type) === 'Text' && typeof node.props.onTextLayout === 'function')[0]!
    const onTextLayout = probe.props.onTextLayout
    if (typeof onTextLayout !== 'function') throw new Error('Text measurement callback missing')
    await act(() => { onTextLayout({ nativeEvent: { lines: measured.map((text) => ({ text, x: 0, y: 0, width: 100, height: 24, descender: 0, capHeight: 16, ascender: 18, xHeight: 12 })) } }) })
    const visible = tree.root.findAll((node) => String(node.type) === 'Text' && node.props.importantForAccessibility !== 'no-hide-descendants')
    expect(visible.map((node) => node.props.children)).toEqual(['Ler', 'palavraMuitoLonga todos os dias'])
    for (const line of visible) expect(line.props).toMatchObject({ numberOfLines: 1, ellipsizeMode: 'tail' })
    await act(() => tree.update(<></>))
  })

  it('keeps a long email on one line with tail ellipsis and the full accessible name', async () => {
    const email = `${'longaddress'.repeat(12)}@example.com`
    const onOpen = vi.fn()
    let tree!: ReactTestRenderer
    await act(() => { tree = create(<ListRow title="Account" description={email} textMode="personal" accessibilityLabel={`Account ${email}`} onClick={onOpen} />) })
    const text = tree.root.findAll((node) => String(node.type) === 'Text' && node.props.children === email)
    expect(text).toHaveLength(1)
    expect(text[0]!.props).toMatchObject({ numberOfLines: 1, ellipsizeMode: 'tail' })
    const row = tree.root.findAll((node) => String(node.type) === 'Pressable' && node.props.accessibilityRole === 'button')[0]!
    expect(row.props.accessibilityLabel).toContain(email)
    await act(() => { (row.props.onPress as () => void)() })
    expect(onOpen).toHaveBeenCalledOnce()
    await act(() => tree.update(<></>))
  })
})

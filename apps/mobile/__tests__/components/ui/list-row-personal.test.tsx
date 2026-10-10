import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { describe, expect, it, vi } from 'vitest'
import { StyleSheet } from 'react-native'
import { ListRow } from '@/components/ui/list-row'
import { PersonalText } from '@/components/ui/personal-text'

describe('personal account row', () => {
  it('expands without a caller style using the readable default line height', async () => {
    let tree!: ReactTestRenderer
    await act(() => { tree = create(<PersonalText expanded>longaddress@example.com</PersonalText>) })
    const line = tree.root.findAll((node) => String(node.type) === 'Text')[0]!
    expect(StyleSheet.flatten(line.props.style)).toMatchObject({ lineHeight: 14 * 1.4 })
    expect(line.props).toMatchObject({ numberOfLines: 1, children: 'longaddress@example.com' })
    await act(() => tree.update(<></>))
  })

  it.each([false, true])('keeps compact personal stacks short and gives wrapped text readable leading with expanded=%s', async (expanded) => {
    const text = 'Pessoa com nome completo e descrição longa'
    let tree!: ReactTestRenderer
    await act(() => { tree = create(<ListRow title={text} description={text} textMode="personal" personalExpanded={expanded} onClick={vi.fn()} />) })
    const probes = tree.root.findAll((node) => String(node.type) === 'Text' && node.props.importantForAccessibility === 'no-hide-descendants')
    expect(probes).toHaveLength(2)
    const measure = async (lines: string[]) => {
      await act(() => {
        for (const probe of probes) {
          const onTextLayout = probe.props.onTextLayout
          if (typeof onTextLayout !== 'function') throw new Error('Text measurement callback missing')
          onTextLayout({ nativeEvent: { target: 1, lines: lines.map((text) => ({ text, x: 0, y: 0, width: 100, height: 24, descender: 0, capHeight: 16, ascender: 18, xHeight: 12 })) } })
        }
      })
      return tree.root.findAll((node) => String(node.type) === 'Text' && node.props.importantForAccessibility !== 'no-hide-descendants').map((node) => StyleSheet.flatten(node.props.style) as { lineHeight: number; fontSize: number })
    }
    for (const style of await measure(['Pessoa com nome completo e descrição longa'])) expect(style.lineHeight / style.fontSize).toBe(1.25)
    const twoLineStyles = await measure(['Pessoa com nome ', 'completo e descrição longa'])
    expect(twoLineStyles).toHaveLength(4)
    for (const style of twoLineStyles) expect(style.lineHeight / style.fontSize).toBeGreaterThanOrEqual(1.4)
    const longStyles = await measure(['Pessoa com nome ', 'completo e descrição ', 'longa'])
    expect(longStyles).toHaveLength(expanded ? 6 : 4)
    for (const style of longStyles) expect(style.lineHeight / style.fontSize).toBeGreaterThanOrEqual(1.4)
    for (const style of await measure(['Pessoa com nome completo e descrição longa'])) expect(style.lineHeight / style.fontSize).toBe(1.25)
    await act(() => tree.update(<></>))
  })

  it.each([2, 3])('gives plain wrapped row text readable leading for %s lines', async (lineCount) => {
    let tree!: ReactTestRenderer
    await act(() => { tree = create(<ListRow title="Pessoa com nome completo" description="Descrição que continua" wrapTitle onClick={vi.fn()} />) })
    const texts = tree.root.findAll((node) => String(node.type) === 'Text' && typeof node.props['data-slot'] === 'string' && node.props['data-slot'].startsWith('list-row-'))
    expect(texts).toHaveLength(2)
    await act(() => {
      for (const text of texts) {
        const onTextLayout = text.props.onTextLayout
        if (typeof onTextLayout !== 'function') throw new Error('Text measurement callback missing')
        onTextLayout({ nativeEvent: { target: 1, lines: ['first', 'second', 'third'].slice(0, lineCount).map((text) => ({ text, x: 0, y: 0, width: 100, height: 24, descender: 0, capHeight: 16, ascender: 18, xHeight: 12 })) } })
      }
    })
    for (const text of texts) {
      const style = StyleSheet.flatten(text.props.style) as { lineHeight: number; fontSize: number }
      expect(style.lineHeight / style.fontSize).toBeGreaterThanOrEqual(1.4)
    }
    await act(() => tree.update(<></>))
  })

  it('repairs measured breaks inside a word and retains two visible lines', async () => {
    const title = 'Ler palavraMuitoLonga todos os dias'
    const measured = ['Ler palavra', 'MuitoLonga ', 'todos os dias']
    let tree!: ReactTestRenderer
    await act(() => { tree = create(<ListRow title={title} textMode="personal" onClick={vi.fn()} />) })
    const probe = tree.root.findAll((node) => String(node.type) === 'Text' && typeof node.props.onTextLayout === 'function')[0]!
    const onTextLayout = probe.props.onTextLayout
    if (typeof onTextLayout !== 'function') throw new Error('Text measurement callback missing')
    await act(() => { onTextLayout({ nativeEvent: { lines: measured.map((text) => ({ text, x: 0, y: 0, width: 100, height: 24, descender: 0, baseline: 0, capHeight: 16, ascender: 18, xHeight: 12 })) } }) })
    const visible = tree.root.findAll((node) => String(node.type) === 'Text' && node.props.importantForAccessibility !== 'no-hide-descendants')
    expect(visible.map((node) => node.props.children)).toEqual(['Ler', 'palavraMuitoLonga todos os dias'])
    for (const line of visible) expect(line.props).toMatchObject({ numberOfLines: 1, ellipsizeMode: 'tail' })
    await act(() => tree.update(<></>))
  })

  it.each([
    { unclamped: false, measured: ['Read extra', 'ordinarilyLongWord ', 'daily before ', 'breakfast'] },
    { unclamped: true, measured: ['Read extra', 'ordinarilyLongWord ', 'daily before ', 'breakfast'] },
    { unclamped: false, measured: ['Read extraordinarily', 'LongWord daily before ', 'breakfast'] },
    { unclamped: true, measured: ['Read extraordinarily', 'LongWord daily before ', 'breakfast'] },
  ])('keeps measured word boundaries when unclamped=$unclamped and lines=$measured', async ({ unclamped, measured }) => {
    const title = 'Read extraordinarilyLongWord daily before breakfast'
    let tree!: ReactTestRenderer
    await act(() => { tree = create(<PersonalText unclamped={unclamped}>{title}</PersonalText>) })
    const probe = tree.root.findAll((node) => String(node.type) === 'Text' && typeof node.props.onTextLayout === 'function')[0]!
    const onTextLayout = probe.props.onTextLayout
    if (typeof onTextLayout !== 'function') throw new Error('Text measurement callback missing')
    await act(() => { onTextLayout({ nativeEvent: { lines: measured.map((text) => ({ text, x: 0, y: 0, width: 100, height: 24, descender: 0, capHeight: 16, ascender: 18, xHeight: 12 })) } }) })
    const visible = tree.root.findAll((node) => String(node.type) === 'Text' && node.props.importantForAccessibility !== 'no-hide-descendants')
    expect(visible.map((node) => node.props.children)).toEqual(unclamped
      ? ['Read', 'extraordinarilyLongWord', 'daily before', 'breakfast']
      : ['Read', 'extraordinarilyLongWord daily before breakfast'])
    for (const line of visible) expect(line.props).toMatchObject({ numberOfLines: 1, ellipsizeMode: 'tail' })
    expect(tree.root.findAll((node) => String(node.type) === 'ScrollView')).toHaveLength(0)
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

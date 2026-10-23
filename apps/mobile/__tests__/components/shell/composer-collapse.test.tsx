import { act, create } from 'react-test-renderer'
import { TextInput, View } from 'react-native'
import { useState, type ComponentProps } from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { Menu } from '@/components/ui/menu'
import { Composer } from '@/components/shell/composer'
import { Shell412 } from '@/components/shell/shell-412'
import { useUIStore } from '@/stores/ui-store'
import { i18n } from '@/lib/i18n'
import { __setWindowDimensions } from '@/test-mocks/react-native'
import { measureSafeArea, type GeometryTree } from '@/__tests__/support/safe-area-geometry'

const clipboard = vi.hoisted(() => ({ getStringAsync: vi.fn().mockResolvedValue('Pasted draft'), hasStringAsync: vi.fn().mockResolvedValue(true) }))
vi.mock('expo-clipboard', () => clipboard)
vi.unmock('react-i18next')
beforeEach(() => useUIStore.setState({ habitComposerCollapsed: false }))
afterEach(() => __setWindowDimensions({ width: 412, height: 915, scale: 1, fontScale: 1 }))

it.each([en, ptBR])('retains its mounted draft and reduces the Fold cover composer to one row', async messages => {
  await i18n.changeLanguage(messages === en ? 'en' : 'pt-BR')
  __setWindowDimensions({ width: 480, height: 640, scale: 1, fontScale: 1 })
  const onSend = vi.fn()
  function Draft() {
    const [value, setValue] = useState('')
    return <Composer collapsible state="idle" value={value} onChangeValue={setValue} onSend={onSend} words={messages.shell.composer} suggestions={[]} />
  }
  let tree!: GeometryTree
  await act(() => { tree = create(<Draft />) as GeometryTree })
  const control = (name: string) => tree.root.findAll(node => String(node.type) === 'Pressable' && node.props.accessibilityLabel === name)[0]!
  const press = (name: string) => act(() => (control(name).props.onPress as () => void)())
  const expanded = (name: string) => (control(name).props.accessibilityState as { expanded: boolean }).expanded
  try {
    const input = tree.root.findAll(node => node.type === TextInput)[0]!
    await act(() => (input.props.onChangeText as (value: string) => void)('Keep this draft'))
    await press(messages.shell.composer.collapse)
    expect(expanded(messages.shell.composer.expand)).toBe(false)
    expect(tree.root.findAll(node => node.type === TextInput)[0]!).toBe(input)
    expect(input.props.value).toBe('Keep this draft')
    expect(useUIStore.getState().habitComposerCollapsed).toBe(true)
    const host = { type: 'View', props: { style: { alignItems: 'stretch' as const } }, children: [tree.toJSON()] }
    const geometry = measureSafeArea(host, host => host.props.testID === 'composer-collapse-row' ? 'row' : undefined, { width: 480, height: 640 })
    expect(geometry.get('row')!.bottom - geometry.get('row')!.top).toBe(48)
    const collapsed = measureSafeArea(host, host => host.props.testID?.startsWith('composer-idle') ? 'composer' : undefined, { width: 480, height: 640 })
    expect(collapsed.get('composer')!.bottom - collapsed.get('composer')!.top).toBeLessThanOrEqual(64)
    await press(messages.shell.composer.expand)
    expect(tree.root.findAll(node => node.type === TextInput)[0]!).toBe(input)
    expect(input.props.value).toBe('Keep this draft')
    await press(messages.shell.composer.send)
    expect(onSend).toHaveBeenCalledOnce()
    await press(messages.shell.composer.collapse)
    await act(() => tree.unmount())
    await act(() => { tree = create(<Draft />) as GeometryTree })
    expect(expanded(messages.shell.composer.expand)).toBe(false)
  } finally { await act(() => tree.unmount()) }
})

it.each([{ width: 480, height: 640 }, { width: 800, height: 360 }].flatMap(viewport => [false, true].map(collapsed => ({ ...viewport, collapsed }))))(
  'allocates separate habit content and composer space at $width by $height, collapsed=$collapsed', async ({ width, height, collapsed }) => {
    __setWindowDimensions({ width, height, scale: 1, fontScale: 1 })
    useUIStore.setState({ habitComposerCollapsed: collapsed })
    let tree!: GeometryTree
    await act(() => { tree = create(<Shell412 header={<View style={{ height: 48 }} />} tabBar={<View style={{ height: 48 }} />}
      composer={<Composer collapsible state="idle" value="Draft" onChangeValue={vi.fn()} onSend={vi.fn()} words={en.shell.composer} suggestions={[]} />}>
      <View testID="habit-content" style={{ flex: 1 }} />
    </Shell412>) as GeometryTree })
    try {
      const geometry = measureSafeArea(tree.toJSON(), host => host.props.testID, { width, height })
      const content = geometry.get('shell-scroller')!
      const pinned = geometry.get('shell-pinned-slot')!
      expect(content.bottom - content.top).toBeGreaterThanOrEqual(96)
      expect(content.bottom).toBeLessThanOrEqual(pinned.top)
      expect(pinned.bottom).toBeLessThanOrEqual(height - 48)
      if (collapsed) expect(pinned.bottom - pinned.top).toBeLessThanOrEqual(64)
    } finally { await act(() => tree.unmount()) }
  },
)

it.each([en, ptBR])('keeps Clear and Paste available in the actions menu beside collapse', async messages => {
  function Draft() {
    const [value, setValue] = useState('Draft')
    return <Composer collapsible state="idle" value={value} onChangeValue={setValue} onSend={vi.fn()}
      words={messages.shell.composer} suggestions={[]} onAttachFile={vi.fn()}
      attachWords={{ ...messages.shell.composer.attach, remove: (name: string) => name }} />
  }
  let tree!: GeometryTree
  await act(() => { tree = create(<Draft />) as GeometryTree })
  try {
    const menu = () => tree.root.findAll(node => node.type === Menu)[0]!
    const items = () => menu().props.items as NonNullable<ComponentProps<typeof Menu>['items']>
    expect(items()[0]).toMatchObject({ id: 'clear', label: messages.shell.composer.clear })
    await act(() => (menu().props.onSelect as (id: string) => void)('clear'))
    expect(tree.root.findAll(node => node.type === TextInput)[0]!.props.value).toBe('')
    expect(items()[0]).toMatchObject({ id: 'paste', label: messages.shell.composer.paste })
    await act(() => (menu().props.onSelect as (id: string) => void)('paste'))
    expect(tree.root.findAll(node => node.type === TextInput)[0]!.props.value).toBe('Pasted draft')
  } finally { await act(() => tree.unmount()) }
})

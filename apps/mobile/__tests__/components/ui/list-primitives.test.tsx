import type { ReactElement } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import type { StyleProp, ViewStyle } from 'react-native'
import { act, create } from 'react-test-renderer'
import { describe, expect, it, vi } from 'vitest'
import { ListRow } from '@/components/ui/list-row'
import { RadioRow } from '@/components/ui/radio-row'
import { RowList } from '@/components/ui/row-list'
import { SettingsGroup } from '@/components/ui/settings-group-list'
import { createTokensV2 } from '@/lib/theme'

vi.mock('@/lib/use-app-theme', () => ({
  useAppTheme: () => ({ currentScheme: 'purple', currentTheme: 'dark' }),
}))

interface TestNode {
  readonly props: Readonly<Record<string, unknown>>
  find(predicate: (node: TestNode) => boolean): TestNode
  findByType(type: unknown): TestNode
  findAllByType(type: unknown): TestNode[]
}

interface TestTree {
  readonly root: TestNode
  update(element: ReactElement): void
}

function render(element: ReactElement): TestTree {
  let tree!: TestTree
  void act(() => {
    tree = create(element) as unknown as TestTree
  })
  return tree
}

function press(node: TestNode) {
  void act(() => {
    ;(node.props.onPress as () => void)()
  })
}

function resolvePressedStyle(node: TestNode) {
  const style = node.props.style as (state: { pressed: boolean }) => unknown
  style({ pressed: false })
  return style({ pressed: true })
}

function actionContent(node: TestNode, pressed: boolean) {
  const children = node.props.children as (state: { pressed: boolean }) => ReactElement
  return render(children({ pressed })).root.findByType(View)
}

describe('list primitives on mobile', () => {
  it('insets invoice actions and navigation controls without shrinking their touch targets', () => {
    const onDownload = vi.fn()
    const tree = render(
      <ListRow title="Invoice" description="September subscription" chevron={false}
        action={{ icon: 'download', label: 'Download invoice', onPress: onDownload }} />,
    )
    const row = tree.root.findByType(View)
    const action = tree.root.findByType(Pressable)
    expect(action.props.accessibilityLabel).toBe('Download invoice')
    expect(StyleSheet.flatten(row.props.style)).toMatchObject({ alignItems: 'stretch' })
    expect(StyleSheet.flatten(row.props.style)).not.toHaveProperty('padding')
    for (const pressed of [false, true]) {
      expect(StyleSheet.flatten(action.props.style)).toMatchObject({ padding: 16, paddingStart: 0, flexShrink: 0 })
      expect(StyleSheet.flatten(actionContent(action, pressed).props.style)).toMatchObject({ width: 44, height: 44, flexShrink: 0 })
    }
    press(action)
    expect(onDownload).toHaveBeenCalledOnce()

    void act(() => { tree.update(<ListRow title="Account" onClick={vi.fn()} />) })
    const navigation = tree.root.findByType(Pressable)
    expect(StyleSheet.flatten(tree.root.findByType(View).props.style)).not.toHaveProperty('padding')
    expect(StyleSheet.flatten(resolvePressedStyle(navigation))).toMatchObject({ minHeight: 76, padding: 16 })
    const chevron = navigation.findAllByType(View).find((node) =>
      StyleSheet.flatten(node.props.style as StyleProp<ViewStyle>).width === 44,
    )
    expect(StyleSheet.flatten(chevron?.props.style)).toMatchObject({ width: 44, height: 44, flexShrink: 0 })

    void act(() => { tree.update(<ListRow title="Read only" readOnly />) })
    expect(tree.root.findAllByType(View).some((node) =>
      StyleSheet.flatten(node.props.style as StyleProp<ViewStyle>).padding === 16,
    )).toBe(true)
    expect(tree.root.findAllByType(Pressable)).toHaveLength(0)
  })

  it('keeps required padding when a caller passes the legacy inset option', () => {
    const tree = render(<ListRow title="Tags" inset={false} onClick={vi.fn()} />)
    const bodyStyle = StyleSheet.flatten(resolvePressedStyle(tree.root.findByType(Pressable)))
    expect(bodyStyle).toMatchObject({ padding: 16 })
    expect(bodyStyle).not.toHaveProperty('paddingEnd')
  })

  it('owns the entire padded perimeter in adjacent body and action targets', () => {
    const onOpen = vi.fn()
    const onRemove = vi.fn()
    const tree = render(
      <ListRow title="Template" onClick={onOpen} chevron={false}
        action={{ icon: 'trash', label: 'Remove template', onPress: onRemove }} />,
    )
    const rowStyle = StyleSheet.flatten(tree.root.findByType(View).props.style)
    expect(rowStyle).toMatchObject({ minHeight: 52, alignItems: 'stretch' })
    expect(rowStyle).not.toHaveProperty('padding')
    const [body, action] = tree.root.findAllByType(Pressable)
    if (!body || !action) throw new Error('ListRow controls did not render')
    expect(StyleSheet.flatten(resolvePressedStyle(body))).toMatchObject({ minHeight: 76, padding: 16, paddingEnd: 0 })
    expect(StyleSheet.flatten(action.props.style)).toMatchObject({ padding: 16, paddingStart: 0 })
    press(body)
    expect(onOpen).toHaveBeenCalledOnce()
    expect(onRemove).not.toHaveBeenCalled()
    press(action)
    expect(onOpen).toHaveBeenCalledOnce()
    expect(onRemove).toHaveBeenCalledOnce()
  })

  it('keeps ListRow body and trailing actions independent', () => {
    const onClick = vi.fn()
    const onAction = vi.fn()
    const tree = render(
      <ListRow
        icon="home"
        title="Account"
        description="Profile and security"
        value="Ready for a deliberately long reminder summary"
        trailing={<Text>Synced</Text>}
        onClick={onClick}
        action={{ icon: 'trash', label: 'Remove account', onPress: onAction, danger: true }}
      />,
    )
    const controls = tree.root.findAllByType(Pressable)
    expect(controls).toHaveLength(2)
    const [bodyControl, actionControl] = controls
    if (!bodyControl || !actionControl) throw new Error('ListRow controls did not render')
    const bodyTexts = bodyControl.findAllByType(Text)
    expect(bodyTexts.map((node) => node.props.children)).toContain('Synced')
    expect(bodyControl.find((node) => node.props.strokeWidth === 1.8)).toBeDefined()
    const valueText = bodyTexts.find((node) => node.props.children === 'Ready for a deliberately long reminder summary')
    expect(valueText?.props.numberOfLines).toBe(1)
    expect(StyleSheet.flatten(valueText?.props.style)).toMatchObject({ flexShrink: 1, maxWidth: '50%' })
    press(bodyControl)
    press(actionControl)
    const bodyPressedStyle = StyleSheet.flatten(resolvePressedStyle(bodyControl))
    const actionPressedStyle = StyleSheet.flatten(actionContent(actionControl, true).props.style)
    expect(bodyPressedStyle).toMatchObject({
      backgroundColor: createTokensV2('purple', 'dark').bgHover,
      transform: [{ scale: 0.96 }],
    })
    expect(actionPressedStyle).toMatchObject({
      backgroundColor: createTokensV2('purple', 'dark').bgHover,
      transform: [{ scale: 0.96 }],
    })
    expect(onClick).toHaveBeenCalledOnce()
    expect(onAction).toHaveBeenCalledOnce()

    void act(() => {
      tree.update(
        <ListRow
          title="Danger zone"
          danger
          chevron={false}
          action={{ icon: 'trash', label: 'Archive', onPress: vi.fn() }}
        />,
      )
    })
    actionContent(tree.root.findByType(Pressable), true)

    void act(() => {
      tree.update(<ListRow title="Read only" readOnly />)
    })
    expect(tree.root.findAllByType(Pressable)).toHaveLength(0)
  })

  it('renders RadioRow selection details and disables unavailable choices', () => {
    const onSelect = vi.fn()
    const tree = render(<RadioRow label="Daily" onSelect={onSelect} />)
    const choice = tree.root.findByType(Pressable)
    expect(choice.props.accessibilityState).toEqual({ checked: false })
    press(choice)
    resolvePressedStyle(choice)
    expect(onSelect).toHaveBeenCalledOnce()

    void act(() => {
      tree.update(
        <RadioRow
          label="Weekly"
          description="Every Monday"
          selected
          onSelect={onSelect}
          leading={<Text>W</Text>}
          depth={2}
          meta="3/4"
          tag="Pro"
        />,
      )
    })
    expect(tree.root.findByType(Pressable).props.accessibilityState).toEqual({ checked: true })

    void act(() => {
      tree.update(
        <RadioRow label="Locked" selected disabled reason="Upgrade required" depth={-2} />,
      )
    })
    expect(tree.root.findAllByType(Pressable)).toHaveLength(0)
    const disabled = tree.root.find(
      (node) => node.props.accessibilityRole === 'radio',
    )
    expect(disabled.props.accessibilityState).toEqual({ checked: true, disabled: true })
  })

  it('filters non-row children and divides valid RowList entries', () => {
    const tree = render(
      <RowList style={{ borderRadius: 8 }}>
        ignored
        <Text>First</Text>
        {null}
        <Text>Second</Text>
      </RowList>,
    )
    const [panel, firstRow, secondRow] = tree.root.findAllByType(View)
    if (!panel || !firstRow || !secondRow) throw new Error('RowList structure did not render')
    expect(tree.root.findAllByType(View)).toHaveLength(3)
    expect(panel.props.children).toHaveLength(2)
    expect(panel.props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ borderRadius: 8 })]),
    )
    expect(firstRow.props.style).toBeUndefined()
    expect(secondRow.props.style).toEqual({
      borderTopColor: createTokensV2('purple', 'dark').hairline,
      borderTopWidth: StyleSheet.hairlineWidth,
    })
    expect(tree.root.findAllByType(Text).map((node) => node.props.children)).toEqual([
      'First',
      'Second',
    ])
  })

  it('renders static and actionable SettingsGroup entries with optional content', () => {
    const openProfile = vi.fn()
    const openPrivacy = vi.fn()
    const tree = render(
      <SettingsGroup
        items={[
          { label: 'Version' },
          { label: 'Profile', value: 'Thomas', trailing: <Text>Verified</Text>, onClick: openProfile },
          { label: 'Plan', value: 'Pro' },
          { label: 'Privacy', onClick: openPrivacy },
        ]}
      />,
    )
    const controls = tree.root.findAllByType(Pressable)
    expect(controls).toHaveLength(2)
    expect(tree.root.findByType(View).props.children).toHaveLength(4)
    expect(tree.root.findAllByType(Text).map((node) => node.props.children)).toEqual([
      'Version',
      'Profile',
      'Thomas',
      'Verified',
      'Plan',
      'Pro',
      'Privacy',
    ])
    for (const control of controls) {
      resolvePressedStyle(control)
      press(control)
    }
    expect(openProfile).toHaveBeenCalledOnce()
    expect(openPrivacy).toHaveBeenCalledOnce()
  })
})

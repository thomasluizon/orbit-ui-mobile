import type { ReactElement } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
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

describe('list primitives on mobile', () => {
  it('keeps ListRow body and trailing actions independent', () => {
    const onClick = vi.fn()
    const onAction = vi.fn()
    const tree = render(
      <ListRow
        icon="home"
        title="Account"
        description="Profile and security"
        value="Ready"
        trailing={<Text>Synced</Text>}
        onClick={onClick}
        action={{ icon: 'trash', label: 'Remove account', onPress: onAction, danger: true }}
      />,
    )
    const controls = tree.root.findAllByType(Pressable)
    expect(controls).toHaveLength(2)
    const [bodyControl, actionControl] = controls
    if (!bodyControl || !actionControl) throw new Error('ListRow controls did not render')
    expect(bodyControl.findAllByType(Text).map((node) => node.props.children)).toContain('Synced')
    press(bodyControl)
    press(actionControl)
    const bodyPressedStyle = StyleSheet.flatten(resolvePressedStyle(bodyControl))
    const actionPressedStyle = StyleSheet.flatten(resolvePressedStyle(actionControl))
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
    resolvePressedStyle(tree.root.findByType(Pressable))

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

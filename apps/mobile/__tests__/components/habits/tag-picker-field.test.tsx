import { describe, expect, it, vi } from 'vitest'
import React from 'react'
import { FlatList, StyleSheet, TextInput } from 'react-native'
import { TagPickerField } from '@/components/habits/habit-form-fields/tag-picker-field'
import { BottomSheetAppTextInput } from '@/components/ui/bottom-sheet-app-text-input'

const TestRenderer = require('react-test-renderer')

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))
vi.mock('@/components/ui/sheet', async () =>
  await import('@/__tests__/support/sheet-double'))
vi.mock('@/components/ui/list-row', () => ({
  ListRow: (props: Record<string, unknown>) => React.createElement('ListRow', props),
}))
vi.mock('@/components/ui/icons', () => ({
  Pencil: 'Pencil',
  Trash2: 'Trash2',
}))
vi.mock('@/lib/use-app-theme', () => ({
  useAppTheme: () => ({ currentScheme: 'default', currentTheme: 'light' }),
}))
vi.mock('@/lib/theme', () => ({
  createTokensV2: () => new Proxy({}, { get: () => '#000000' }),
}))

function buildTags(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `tag-${index}`,
    name: `Tag ${index}`,
    color: '#000000',
  }))
}

function findButtonWithText(root: { findAll: (predicate: (node: { props: Record<string, unknown>; findAll: (childPredicate: (child: { type: unknown; props: Record<string, unknown> }) => boolean) => unknown[] }) => boolean) => { props: Record<string, unknown> }[] }, text: string) {
  return root.findAll((node) =>
    node.props.accessibilityRole === 'button' &&
    node.findAll((child) => child.type === 'Text' && child.props.children === text).length > 0,
  )[0]!
}

it('shows an actionable empty state instead of an empty picker body', async () => {
  const onCreate = vi.fn()
  let tree: ReturnType<typeof TestRenderer.create>
  await TestRenderer.act(() => {
    tree = TestRenderer.create(
      <TagPickerField
        tags={[]}
        selectedIds={[]}
        atLimit={false}
        disabled={false}
        onToggle={vi.fn()}
        onCreate={onCreate}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        editLabel="Edit"
        deleteLabel="Delete"
      />,
    )
  })
  await TestRenderer.act(() => {
    tree.root.findByType('ListRow').props.onClick()
  })

  expect(tree.root.findAll((node: { type: unknown; props: Record<string, unknown> }) =>
    node.type === 'Text' && node.props.children === 'habits.form.noTags')).toHaveLength(1)
  await TestRenderer.act(() => {
    findButtonWithText(tree.root, 'habits.form.newTag').props.onPress()
  })
  expect(onCreate).toHaveBeenCalledOnce()
})

it('selects a tag below the first viewport while the search keyboard is open', async () => {
  const onToggle = vi.fn()
  const tags = buildTags(25)
  let tree: ReturnType<typeof TestRenderer.create>
  await TestRenderer.act(() => {
    tree = TestRenderer.create(
      <TagPickerField
        tags={tags}
        selectedIds={[]}
        atLimit={false}
        disabled={false}
        onToggle={onToggle}
        onCreate={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        editLabel="Edit"
        deleteLabel="Delete"
      />,
    )
  })
  await TestRenderer.act(() => {
    tree.root.findByType('ListRow').props.onClick()
  })

  expect(tree.root.findByType(BottomSheetAppTextInput)).toBeDefined()
  const list = tree.root.findByType(FlatList)
  expect(list.props.nestedScrollEnabled).toBe(true)
  expect(list.props.keyboardShouldPersistTaps).toBe('handled')

  let row: ReturnType<typeof TestRenderer.create>
  await TestRenderer.act(() => {
    row = TestRenderer.create(list.props.renderItem({ item: tags[20], index: 20 }))
  })
  await TestRenderer.act(() => {
    row.root.findAll((node: { props: Record<string, unknown> }) => node.props.accessibilityRole === 'button')[0]!.props.onPress()
  })
  expect(onToggle).toHaveBeenCalledWith('tag-20')
})

it.each(['create', 'edit'])('keeps the %s tag input inside the keyboard-aware virtual list', async (mode) => {
  const tags = buildTags(25)
  let tree: ReturnType<typeof TestRenderer.create>
  await TestRenderer.act(() => {
    tree = TestRenderer.create(
      <TagPickerField
        tags={tags}
        selectedIds={[]}
        atLimit={false}
        disabled={false}
        editor={<BottomSheetAppTextInput testID={`${mode}-tag-input`} value="" />}
        onToggle={vi.fn()}
        onCreate={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        editLabel="Edit"
        deleteLabel="Delete"
      />,
    )
  })
  await TestRenderer.act(() => {
    tree.root.findByType('ListRow').props.onClick()
  })

  const list = tree.root.findByType(FlatList)
  expect(StyleSheet.flatten(list.props.style)).toMatchObject({ maxHeight: 360 })
  const footer = list.props.ListFooterComponent
  let footerTree: ReturnType<typeof TestRenderer.create>
  await TestRenderer.act(() => {
    footerTree = TestRenderer.create(footer)
  })
  const input = footerTree.root.findByType(TextInput)
  expect(input.props.testID).toBe(`${mode}-tag-input`)
  expect(() => {
    TestRenderer.act(() => input.props.onFocus({}))
  }).not.toThrow()
})

it('filters tags while keeping a creation action when no tag matches', async () => {
  const tags = buildTags(25)
  const onCreate = vi.fn()
  let tree: ReturnType<typeof TestRenderer.create>
  await TestRenderer.act(() => {
    tree = TestRenderer.create(
      <TagPickerField
        tags={tags}
        selectedIds={[]}
        atLimit={false}
        disabled={false}
        onToggle={vi.fn()}
        onCreate={onCreate}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        editLabel="Edit"
        deleteLabel="Delete"
      />,
    )
  })
  await TestRenderer.act(() => {
    tree.root.findByType('ListRow').props.onClick()
  })

  const search = tree.root.findByType(BottomSheetAppTextInput)
  await TestRenderer.act(() => {
    search.props.onChangeText('Tag 24')
  })
  expect(tree.root.findByType(FlatList).props.data).toEqual([tags[24]])

  await TestRenderer.act(() => {
    tree.root.findByType(BottomSheetAppTextInput).props.onChangeText('No match')
  })
  const list = tree.root.findByType(FlatList)
  expect(list.props.data).toEqual([])
  let footer: ReturnType<typeof TestRenderer.create>
  await TestRenderer.act(() => {
    footer = TestRenderer.create(list.props.ListFooterComponent)
  })
  await TestRenderer.act(() => {
    findButtonWithText(footer.root, 'habits.form.newTag').props.onPress()
  })
  expect(onCreate).toHaveBeenCalledOnce()
})

it('selects and deselects a tag and exposes its edit and delete actions', async () => {
  const tags = buildTags(2)
  const onToggle = vi.fn()
  const onEdit = vi.fn()
  const onDelete = vi.fn()
  const props = {
    tags,
    atLimit: false,
    disabled: false,
    onToggle,
    onCreate: vi.fn(),
    onEdit,
    onDelete,
    editLabel: 'Edit',
    deleteLabel: 'Delete',
  }
  let tree: ReturnType<typeof TestRenderer.create>
  await TestRenderer.act(() => {
    tree = TestRenderer.create(<TagPickerField {...props} selectedIds={[]} />)
  })
  await TestRenderer.act(() => {
    tree.root.findByType('ListRow').props.onClick()
  })

  let tagButton = findButtonWithText(tree.root, 'Tag 0')
  expect(tagButton.props.accessibilityState).toMatchObject({ selected: false, disabled: false })
  await TestRenderer.act(() => {
    tagButton.props.onPress()
  })
  expect(onToggle).toHaveBeenLastCalledWith('tag-0')

  await TestRenderer.act(() => {
    tree.update(<TagPickerField {...props} selectedIds={['tag-0']} />)
  })
  tagButton = findButtonWithText(tree.root, 'Tag 0')
  expect(tagButton.props.accessibilityState).toMatchObject({ selected: true, disabled: false })
  await TestRenderer.act(() => {
    tagButton.props.onPress()
    tree.root.findByProps({ accessibilityLabel: 'Edit: Tag 0' }).props.onPress()
    tree.root.findByProps({ accessibilityLabel: 'Delete: Tag 0' }).props.onPress()
  })
  expect(onToggle).toHaveBeenCalledTimes(2)
  expect(onEdit).toHaveBeenCalledWith(tags[0])
  expect(onDelete).toHaveBeenCalledWith('tag-0')
})

it('renders an editor when an empty tag collection is being created', async () => {
  let tree: ReturnType<typeof TestRenderer.create>
  await TestRenderer.act(() => {
    tree = TestRenderer.create(
      <TagPickerField
        tags={[]}
        selectedIds={[]}
        atLimit={false}
        disabled={false}
        editor={<BottomSheetAppTextInput testID="tag-editor" value="" />}
        onToggle={vi.fn()}
        onCreate={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        editLabel="Edit"
        deleteLabel="Delete"
      />,
    )
  })
  await TestRenderer.act(() => {
    tree.root.findByType('ListRow').props.onClick()
  })

  expect(tree.root.findByProps({ testID: 'tag-editor' })).toBeDefined()
  expect(tree.root.findAll((node: { type: unknown; props: Record<string, unknown> }) =>
    node.type === 'Text' && node.props.children === 'habits.form.noTags')).toHaveLength(0)
})

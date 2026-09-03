import { describe, expect, it, vi } from 'vitest'
import React from 'react'
import { FlatList } from 'react-native'
import { TagPickerField } from '@/components/habits/habit-form-fields/tag-picker-field'

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
vi.mock('@/components/ui/bottom-sheet-app-text-input', () => ({
  BottomSheetAppTextInput: 'BottomSheetAppTextInput',
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

it('selects a tag below the first viewport while the search keyboard is open', async () => {
  const onToggle = vi.fn()
  const tags = Array.from({ length: 25 }, (_, index) => ({
    id: `tag-${index}`,
    name: `Tag ${index}`,
    color: '#000000',
  }))
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

  expect(tree.root.findByType('BottomSheetAppTextInput')).toBeDefined()
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

import { describe, expect, it, vi } from 'vitest'
import { ActionRow } from '@/components/ui/action-row'
import { PillButton } from '@/components/ui/pill-button'

vi.mock('@/lib/use-app-theme', () => ({
  useAppTheme: () => ({ currentScheme: 'purple', currentTheme: 'dark' }),
}))

const TestRenderer = require('react-test-renderer')

function ConditionalActions() {
  return <><PillButton variant="ghost">Cancel</PillButton><PillButton size="md">Save</PillButton></>
}

describe('ActionRow', () => {
  it('owns trailing alignment, wrapping, a twelve pixel gap and one small size through compositions', () => {
    let tree: any
    TestRenderer.act(() => { tree = TestRenderer.create(<ActionRow><ConditionalActions /></ActionRow>) })
    const row = tree.root.findByProps({ testID: 'action-row' })
    expect(row.props.style).toEqual(expect.objectContaining({
      justifyContent: 'flex-end', flexDirection: 'row', flexWrap: 'wrap', gap: 12, width: '100%',
    }))
    expect(tree.root.findAllByType('Pressable').map((button: any) => button.props.testID)).toEqual(['button-ghost-sm', 'button-primary-sm'])
  })

  it('preserves disabled and pending actions', () => {
    let tree: any
    TestRenderer.act(() => { tree = TestRenderer.create(<ActionRow><PillButton variant="ghost" disabled>Cancel</PillButton><PillButton loading>Save</PillButton></ActionRow>) })
    const buttons = tree.root.findAllByType('Pressable')
    expect(buttons.map((button: any) => button.props.accessibilityState)).toEqual([
      { disabled: true, busy: false }, { disabled: true, busy: true },
    ])
  })
})

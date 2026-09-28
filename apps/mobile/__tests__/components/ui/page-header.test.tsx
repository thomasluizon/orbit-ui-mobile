import { describe, expect, it, vi } from 'vitest'
import { PageHeader } from '@/components/ui/page-header'
import { press, renderNavigation } from './navigation-render'

describe('PageHeader', () => {
  it('names the back control and exposes one start-aligned title', () => {
    const onBack = vi.fn()
    const tree = renderNavigation(<PageHeader title="About" backLabel="Back to Profile" onBack={onBack} />)
    const back = tree.hosts().find((node) => node.props.accessibilityLabel === 'Back to Profile')
    expect(back).toBeDefined()
    if (!back) throw new Error('Expected back control')
    press(back)
    expect(onBack).toHaveBeenCalledTimes(1)
    const headings = tree.hosts().filter((node) => node.props.accessibilityRole === 'header')
    expect(headings).toHaveLength(1)
    expect(headings[0]?.props.children).toBe('About')
    tree.unmount()
  })
})

import { describe, expect, it } from 'vitest'
import { SectionLabel } from '@/components/ui/section-label'
import { renderNavigation } from './navigation-render'

describe('SectionLabel', () => {
  it('shows the optional eyebrow before the heading and owns consistent spacing', () => {
    const tree = renderNavigation(<><SectionLabel>Habits</SectionLabel><SectionLabel eyebrow="This week">Goals</SectionLabel></>)
    const headings = tree.hosts().filter((node) => node.props.accessibilityRole === 'header')
    expect(headings.map((node) => node.props.children)).toEqual(['Habits', 'Goals'])
    const labels = tree.hosts().filter((node) => node.type === 'Text').map((node) => node.props.children)
    expect(labels).toEqual(['Habits', 'This week', 'Goals'])
    const containers = tree.hosts().filter((node) => String(node.props.testID).startsWith('section-title'))
    expect(containers[0]!.props.style).toEqual(containers[1]!.props.style)
    tree.unmount()
  })
})

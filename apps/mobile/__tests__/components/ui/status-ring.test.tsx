import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { StatusRingProps } from '@orbit/shared/contracts/lists'
import { StatusRing } from '@/components/ui/status-ring'

interface TestNode {
  props: Record<string, unknown>
}

interface TestTree {
  root: {
    findByProps(props: Record<string, unknown>): TestNode
  }
}

interface TestRendererApi {
  create(element: React.ReactNode): TestTree
  act(callback: () => void): void
}

const TestRenderer: TestRendererApi = require('react-test-renderer')
type StatusRingStatus = NonNullable<StatusRingProps['status']>

const STATUSES: readonly StatusRingStatus[] = ['empty', 'done', 'overdue', 'bad']

vi.mock('@/lib/use-app-theme', () => ({
  useAppTheme: () => ({ currentScheme: 'purple', currentTheme: 'dark' }),
}))

function renderStatus(status: StatusRingStatus): TestNode {
  let tree!: TestTree
  TestRenderer.act(() => {
    tree = TestRenderer.create(
      <StatusRing status={status} label={`${status} status`} />,
    )
  })
  return tree.root.findByProps({ testID: 'status-ring' })
}

describe('StatusRing', () => {
  it.each(STATUSES)('renders the %s state with its caller-supplied name', (status) => {
    const ring = renderStatus(status)

    expect(ring.props.accessibilityRole).toBe('image')
    expect(ring.props.accessibilityLabel).toBe(`${status} status`)
  })
})

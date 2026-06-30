import { describe, expect, it, vi } from 'vitest'
import type { Recap } from '@orbit/shared/types/gamification'
import { createMockRecap } from '@orbit/shared/__tests__/factories'
import { ShareCard } from '@/components/share/share-card'

const TestRenderer = require('react-test-renderer')

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${JSON.stringify(params)}` : key,
  }),
}))

function collectText(node: unknown): string {
  if (node == null) return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(collectText).join(' ')
  if (typeof node === 'object' && 'children' in (node as Record<string, unknown>)) {
    return collectText((node as { children: unknown }).children)
  }
  return ''
}

function render(props: { recap: Recap; displayName?: string }) {
  let tree: {
    toJSON: () => unknown
    root: { findAll: (predicate: (node: { props?: Record<string, unknown> }) => boolean) => unknown[] }
  }
  TestRenderer.act(() => {
    tree = TestRenderer.create(<ShareCard {...props} />)
  })
  return tree!
}

describe('ShareCard (mobile)', () => {
  it('renders the branded capture target from a recap', () => {
    const tree = render({ recap: createMockRecap() })
    const roots = tree.root.findAll((node) => node.props?.testID === 'share-card')
    expect(roots.length).toBeGreaterThan(0)
  })

  it('renders the streak hero, formatted stats, top habits, and the scannable link', () => {
    const text = collectText(render({ recap: createMockRecap() }).toJSON())
    expect(text).toContain('shareCard.streak')
    expect(text).toContain('82%')
    expect(text).toContain('Morning run')
    expect(text).toContain('shareCard.scanToJoin')
    expect(text).toContain('app.useorbit.org/r/ABC123?recap=week')
  })

  it('hides the scannable link footer when the recap has no deep link', () => {
    const text = collectText(render({ recap: createMockRecap({ shareDeepLink: '' }) }).toJSON())
    expect(text).not.toContain('shareCard.scanToJoin')
  })
})

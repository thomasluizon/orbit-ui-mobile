import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { ReactElement, ReactNode, ViewTransitionInstance, ViewTransitionProps } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { motionPresets } from '@orbit/shared/theme'

const captured = vi.hoisted(() => ({ props: null as null | (ViewTransitionProps & { children: ReactNode }) }))

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>()
  return {
    ...actual,
    ViewTransition: (props: ViewTransitionProps & { children: ReactNode }) => {
      captured.props = props
      return props.children
    },
  }
})

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
vi.mock('@/components/ui/lockup', () => ({ Lockup: () => <div>Orbit</div> }))

import { TabViewTransition } from '@/components/motion/tab-view-transition'
import { ShellWide } from '@/components/shell/shell-wide'

const stylesheet = readFileSync(resolve(process.cwd(), 'app/globals.css'), 'utf8')
const originalMatchMedia = window.matchMedia

function setReducedMotion(reduced: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: reduced && query === '(prefers-reduced-motion: reduce)',
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia
}

function createInstance() {
  const exit = vi.fn(() => ({ cancel: vi.fn() }))
  const enter = vi.fn(() => ({ cancel: vi.fn() }))
  const instance = { name: 'orbit-tab-page', old: { animate: exit }, new: { animate: enter } } as unknown as ViewTransitionInstance
  return { instance, exit, enter }
}

function ruleBody(selector: string) {
  const start = stylesheet.indexOf(selector)
  expect(start).toBeGreaterThanOrEqual(0)
  return stylesheet.slice(stylesheet.indexOf('{', start) + 1, stylesheet.indexOf('}', start))
}

describe('TabViewTransition', () => {
  afterEach(() => {
    captured.props = null
    window.matchMedia = originalMatchMedia
  })

  it('runs a view transition only for typed primary tab navigation', () => {
    render(<TabViewTransition><main>Today</main></TabViewTransition>)

    expect(screen.getByRole('main')).toHaveTextContent('Today')
    expect(captured.props).toMatchObject({
      name: 'orbit-tab-page',
      default: 'none',
      update: {
        'orbit-tab-forward': 'orbit-tab-switch',
        'orbit-tab-back': 'orbit-tab-switch',
        default: 'none',
      },
    })
  })

  it('animates the old page out and the new page in from the shared tab preset', () => {
    setReducedMotion(false)
    const { instance, exit, enter } = createInstance()
    render(<TabViewTransition><main>Today</main></TabViewTransition>)

    captured.props!.onUpdate!(instance, ['orbit-tab-back'])

    expect(exit).toHaveBeenCalledWith({ opacity: [1, 0] }, expect.objectContaining({
      duration: motionPresets['tab-switch'].exitDuration,
    }))
    expect(enter).toHaveBeenCalledWith(expect.objectContaining({
      transform: [`translateX(${-motionPresets['tab-switch'].shift}px)`, 'translateX(0)'],
    }), expect.objectContaining({
      duration: motionPresets['tab-switch'].enterDuration,
    }))
  })

  it('reads the live reduced-motion preference when the transition starts', () => {
    setReducedMotion(true)
    const { instance, exit, enter } = createInstance()
    render(<TabViewTransition><main>Today</main></TabViewTransition>)

    captured.props!.onUpdate!(instance, ['orbit-tab-forward'])

    expect(exit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ duration: 0 }))
    expect(enter).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ duration: 0 }))
  })

  it('wraps the shell scroller so the page swaps inside its own clip', () => {
    render(
      <ShellWide astraRow={{ label: 'Astra', onOpen: () => {} }} items={[]} activeId="hoje" navLabel="Main">
        <p>Today</p>
      </ShellWide>,
    )

    const boundaryChild = captured.props!.children as ReactElement<Record<string, unknown>>
    expect(boundaryChild.type).toBe('main')
    expect(boundaryChild.props['data-shell-scroller']).toBe('')
    expect(screen.getByText('Today').closest('[data-shell-scroller]')).not.toBeNull()
  })
})

describe('globals.css tab view transition', () => {
  it('hands both legs to the script so no browser default cross-fade runs', () => {
    const body = ruleBody('::view-transition-new(orbit-tab-page) {')
    expect(body).toContain('animation: none')
    expect(body).toContain('mix-blend-mode: normal')
  })

  it('keeps the shell chrome instant during a tab switch', () => {
    expect(ruleBody(':root:active-view-transition-type(orbit-tab-forward, orbit-tab-back)::view-transition-new(root) {'))
      .toContain('animation-duration: 0s')
  })

  it('lets taps reach the live page while the tab legs run', () => {
    expect(ruleBody(':root:active-view-transition-type(orbit-tab-forward, orbit-tab-back)::view-transition {'))
      .toContain('pointer-events: none')
  })

  it('stops every view transition animation under reduced motion', () => {
    const reduced = stylesheet.slice(stylesheet.indexOf('::view-transition-group(*)'))
    expect(stylesheet.lastIndexOf('@media (prefers-reduced-motion: reduce)', stylesheet.indexOf('::view-transition-group(*)')))
      .toBeGreaterThan(stylesheet.indexOf('PRIMARY TAB SWITCH'))
    expect(reduced.slice(0, reduced.indexOf('}'))).toContain('animation-duration: 0s !important')
  })
})

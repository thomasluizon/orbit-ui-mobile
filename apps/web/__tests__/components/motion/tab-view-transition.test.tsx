import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postcss, { type Rule } from 'postcss'
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

const parsedStylesheet = postcss.parse(readFileSync(resolve(process.cwd(), 'app/globals.css'), 'utf8'))
const TAB_SWITCH = ':root:active-view-transition-type(orbit-tab-forward, orbit-tab-back)'
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

function declarationValues(selector: string, property: string) {
  const values: string[] = []
  parsedStylesheet.walkRules((rule) => {
    if (!rule.selectors.includes(selector)) return
    rule.walkDecls(property, (declaration) => { values.push(declaration.value) })
  })
  return values
}

function tabSwitchViewTransitionNames() {
  const names = new Map<string, string>()
  parsedStylesheet.walkRules((rule) => {
    for (const selector of rule.selectors) {
      if (!selector.startsWith(`${TAB_SWITCH} `)) continue
      rule.walkDecls('view-transition-name', (declaration) => { names.set(selector.slice(TAB_SWITCH.length + 1), declaration.value) })
    }
  })
  return names
}

function renderTodayShell() {
  render(
    <ShellWide
      astraRow={{ label: 'Astra', onOpen: () => {} }}
      items={[]}
      activeId="hoje"
      navLabel="Main"
      astraButton={<button type="button">Astra</button>}
      fab={<button type="button">Create</button>}
      scrollToTop={<button type="button">Top</button>}
      tabViewTransition
    >
      <p>Today</p>
    </ShellWide>,
  )
  const scroller = document.querySelector('[data-shell-scroller]')!
  return { scroller, overlays: [...scroller.parentElement!.children].filter((child) => child !== scroller) }
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

  it('wraps the shell scroller so the page swaps inside its own clip when the shell opts in', () => {
    render(
      <ShellWide astraRow={{ label: 'Astra', onOpen: () => {} }} items={[]} activeId="hoje" navLabel="Main" tabViewTransition>
        <p>Today</p>
      </ShellWide>,
    )

    const boundaryChild = captured.props!.children as ReactElement<Record<string, unknown>>
    expect(boundaryChild.type).toBe('main')
    expect(boundaryChild.props['data-shell-scroller']).toBe('')
    expect(screen.getByText('Today').closest('[data-shell-scroller]')).not.toBeNull()
  })

  it('mounts no boundary in a shell that does not opt in', () => {
    render(
      <ShellWide nav={false}>
        <p>Flow</p>
      </ShellWide>,
    )

    expect(captured.props).toBeNull()
    expect(screen.getByText('Flow').closest('[data-shell-scroller]')).not.toBeNull()
  })
})

describe('globals.css tab view transition', () => {
  afterEach(() => {
    captured.props = null
  })

  it('hands both legs to the script so no browser default cross-fade runs', () => {
    expect(declarationValues('::view-transition-new(orbit-tab-page)', 'animation')).toContain('none')
    expect(declarationValues('::view-transition-new(orbit-tab-page)', 'mix-blend-mode')).toContain('normal')
  })

  it('keeps both page legs inside the scroller box so no leg paints over the chrome around it', () => {
    expect(declarationValues('::view-transition-group(orbit-tab-page)', 'overflow')).toEqual(['clip'])
  })

  it('keeps the shell chrome instant during a tab switch', () => {
    expect(declarationValues(`${TAB_SWITCH}::view-transition-old(root)`, 'animation-duration')).toEqual(['0s'])
    expect(declarationValues(`${TAB_SWITCH}::view-transition-new(root)`, 'animation-duration')).toEqual(['0s'])
  })

  it('lifts every control floating over the tab page into its own group above the page', () => {
    const { scroller, overlays } = renderTodayShell()
    const names = tabSwitchViewTransitionNames()

    expect(overlays.map((overlay) => [...names].filter(([selector]) => overlay.matches(selector)).map(([, name]) => name)))
      .toEqual([['orbit-shell-fab'], ['orbit-shell-scroll-to-top']])
    for (const overlay of overlays) {
      expect(scroller.compareDocumentPosition(overlay) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
      expect(overlay.classList).toContain('z-sticky')
    }
    for (const selector of names.keys()) expect(document.querySelectorAll(selector)).toHaveLength(1)
  })

  it('changes the lifted controls at once during a tab switch', () => {
    const names = new Set(tabSwitchViewTransitionNames().values())

    expect(names.size).toBeGreaterThan(0)
    for (const name of names) {
      for (const part of ['group', 'old', 'new']) {
        expect(declarationValues(`${TAB_SWITCH}::view-transition-${part}(${name})`, 'animation-duration')).toEqual(['0s'])
      }
    }
  })

  it('lets taps reach the live page while the tab legs run', () => {
    expect(declarationValues(`${TAB_SWITCH}::view-transition`, 'pointer-events')).toEqual(['none'])
  })

  it('stops every view transition animation under reduced motion', () => {
    const tabSwitchRules: Rule[] = []
    parsedStylesheet.walkRules((rule) => {
      if (rule.selectors.some((selector) => selector.startsWith(TAB_SWITCH))) tabSwitchRules.push(rule)
    })
    expect(tabSwitchRules).not.toHaveLength(0)
    const resets: { selectors: string[]; durations: string[]; followsTabSwitch: boolean }[] = []
    parsedStylesheet.walkAtRules('media', (media) => {
      if (media.params !== '(prefers-reduced-motion: reduce)') return
      media.walkRules((rule) => {
        if (!rule.selectors.includes('::view-transition-group(*)')) return
        const durations: string[] = []
        rule.walkDecls('animation-duration', (declaration) => {
          durations.push(`${declaration.value}${declaration.important ? ' !important' : ''}`)
        })
        resets.push({
          selectors: rule.selectors,
          durations,
          followsTabSwitch: tabSwitchRules.every((tabSwitch) => tabSwitch.source!.end!.offset <= rule.source!.start!.offset),
        })
      })
    })
    expect(resets).toEqual([{
      selectors: ['::view-transition-group(*)', '::view-transition-old(*)', '::view-transition-new(*)'],
      durations: ['0s !important'],
      followsTabSwitch: true,
    }])
  })
})

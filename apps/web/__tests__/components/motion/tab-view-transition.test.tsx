import { readdirSync, readFileSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import postcss, { type Rule } from 'postcss'
import type { ReactElement, ReactNode, ViewTransitionInstance, ViewTransitionProps } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { motionPresets } from '@orbit/shared/theme'

const captured = vi.hoisted(() => ({
  props: null as null | (ViewTransitionProps & { children: ReactNode }),
  renders: [] as (ViewTransitionProps & { children: ReactNode })[],
}))
const navigation = vi.hoisted(() => ({ pathname: '/calendar' }))

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>()
  return {
    ...actual,
    ViewTransition: (props: ViewTransitionProps & { children: ReactNode }) => {
      captured.props = props
      captured.renders.push(props)
      return props.children
    },
  }
})

vi.mock('next/navigation', () => ({ usePathname: () => navigation.pathname }))

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
vi.mock('@/components/ui/lockup', () => ({ Lockup: () => <div>Orbit</div> }))

import { TabViewTransition } from '@/components/motion/tab-view-transition'
import { ShellWide } from '@/components/shell/shell-wide'
import { getCurrentRouteTransitionIntent, resetRouteTransitionIntent, setRouteTransitionIntent } from '@/lib/motion/route-intent'

const parsedStylesheet = postcss.parse(readFileSync(resolve(process.cwd(), 'app/globals.css'), 'utf8'))
const TAB_SWITCH = ':root:active-view-transition'
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

function switchTabs(from: string, to: string, intent: 'tab' | 'neutral' = 'tab') {
  navigation.pathname = from
  const view = render(<TabViewTransition><main>{from}</main></TabViewTransition>)
  act(() => setRouteTransitionIntent(intent))
  captured.renders = []
  navigation.pathname = to
  view.rerender(<TabViewTransition><main>{to}</main></TabViewTransition>)
  return captured.renders.map((props) => props.update)
}

function tabSwitchProps() {
  const props = captured.renders.find((rendered) => rendered.update !== 'none')
  expect(props).toBeDefined()
  return props!
}

function viewTransitionSources() {
  return ['app', 'components', 'hooks', 'lib'].flatMap((root) => readdirSync(resolve(process.cwd(), root), { recursive: true, encoding: 'utf8' })
    .filter((path) => /\.(ts|tsx)$/.test(path))
    .map((path) => resolve(process.cwd(), root, path))
    .filter((path) => /\bViewTransition\b|startViewTransition/.test(readFileSync(path, 'utf8')))
    .map((path) => relative(process.cwd(), path)))
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
    captured.renders = []
    navigation.pathname = '/calendar'
    act(() => resetRouteTransitionIntent())
    window.matchMedia = originalMatchMedia
  })

  it('names the page boundary and runs no transition while the pathname stays', () => {
    render(<TabViewTransition><main>Today</main></TabViewTransition>)

    expect(screen.getByRole('main')).toHaveTextContent('Today')
    expect(captured.props).toMatchObject({ name: 'orbit-tab-page', default: 'none', update: 'none' })
  })

  it('runs the tab switch on the commit that changes the pathname after a tab press, then stands down', () => {
    expect(switchTabs('/calendar', '/')).toEqual(['orbit-tab-switch', 'none'])
    expect(screen.getByRole('main')).toHaveTextContent('/')
  })

  it('consumes the tab press at its commit and arms again for the next tab press', () => {
    navigation.pathname = '/calendar'
    const view = render(<TabViewTransition><main>Calendar</main></TabViewTransition>)
    act(() => setRouteTransitionIntent('tab'))
    navigation.pathname = '/'
    view.rerender(<TabViewTransition><main>Today</main></TabViewTransition>)
    expect(getCurrentRouteTransitionIntent()).toBe('neutral')

    captured.renders = []
    act(() => setRouteTransitionIntent('tab'))
    expect(getCurrentRouteTransitionIntent()).toBe('tab')
    expect(captured.renders.map((props) => props.update)).not.toContain('orbit-tab-switch')

    navigation.pathname = '/calendar'
    view.rerender(<TabViewTransition><main>Calendar</main></TabViewTransition>)
    expect(captured.renders.map((props) => props.update)).toContain('orbit-tab-switch')
    expect(captured.props!.update).toBe('none')
  })

  it('runs no tab switch for a pathname change that no tab press started', () => {
    expect(new Set(switchTabs('/calendar', '/', 'neutral'))).toEqual(new Set(['none']))
  })

  it('animates the old page out and the new page in from the shared tab preset', () => {
    setReducedMotion(false)
    const { instance, exit, enter } = createInstance()
    switchTabs('/calendar', '/')

    tabSwitchProps().onUpdate!(instance, [])

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
    switchTabs('/', '/calendar')

    tabSwitchProps().onUpdate!(instance, [])

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

  it('scopes the tab switch rules to any active view transition because the tab page is the only one', () => {
    expect(viewTransitionSources()).toEqual(['components/motion/tab-view-transition.tsx'])
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

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import type { Locator, Page } from '@playwright/test'
import { INTERACTION_FILL_CLEARANCE } from '@orbit/shared/theme'
import { createHermeticFixtureRequest } from '@/test-support/hermetic/fixture-request'
import { bundleGeometry } from '@/__tests__/support/profile-settings-browser'
import { inspectInteractionSurface } from '@/__tests__/support/interaction-surface-geometry'
import { settleAnimations } from '@/e2e/layout/settle-animations'
import { loadAppFonts } from '@/__tests__/support/app-fonts'
import { resolveWebThemeVariables } from '@/lib/theme-dom'
import { closeChrome, type registerChromeLaunchHook as RegisterChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

const controls = 'button:not(:disabled), a[href], input:not([type="hidden"]):not(:disabled), textarea:not(:disabled), select:not(:disabled), summary, [role="button"], [role="switch"], [role="checkbox"], [role="radio"], [role="tab"], [role="menuitem"], [role="combobox"], [contenteditable="true"], [tabindex]:not([tabindex="-1"])'
export const destinationInteractionCases = [320, 480, 840, 1100, 1440].flatMap(width => (['en', 'pt-BR'] as const).flatMap(locale =>
  (width >= 1024 ? [false, true] : [false]).map(collapsed => ({ width, locale, collapsed })))).flatMap(scenario => ['/', '/calendar', '/progress', '/profile'].map(route => ({ ...scenario, route })))

type SweepCase = (typeof destinationInteractionCases)[number]

function bundleDestinations() {
  return bundleGeometry(`import React, { useState } from 'react';
    import { createRoot } from 'react-dom/client';
    import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
    import { NextIntlClientProvider } from 'next-intl';
    import en from '@orbit/shared/i18n/en.json'; import ptBR from '@orbit/shared/i18n/pt-BR.json';
    import { TodayPageClient } from './app/(app)/today-page-client';
    import CalendarPage from './app/(app)/calendar/page';
    import ProgressPage from './app/(app)/progress/page';
    import ProfilePage from './app/(app)/profile/page';
    import { TodayProvider } from './app/(app)/today-provider';
    import { DestinationShell } from './components/shell/destination-shell';
    import { CreateHabitModal } from './components/habits/create-habit-modal';
    import { PreloadedProfileContext } from './hooks/use-profile';
    import { profileFixture } from './test-support/hermetic/mock-api/fixtures/profile';
    import { useShellStore } from './stores/shell-store';
    import { useAuthStore } from './stores/auth-store';
    const configuration = JSON.parse(document.getElementById('configuration').textContent);
    const profile = { ...profileFixture, language: configuration.locale };
    useAuthStore.setState({ isAuthenticated: true, user: { userId: 'surface-account', name: profile.name, email: profile.email } });
    useShellStore.setState({ sidebarCollapsed: configuration.collapsed });
    window.fetch = async input => {
      const path = typeof input === 'string' ? input : input.url;
      const response = await window.surfaceFixture(new URL(path, document.baseURI).pathname + new URL(path, document.baseURI).search);
      return new Response(JSON.stringify(response.body), { status: response.status, headers: { 'content-type': 'application/json' } });
    };
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false, staleTime: Infinity }, mutations: { retry: false } } });
    window.surfaceClient = client;
    function Destination() {
      const [creating, setCreating] = useState(false);
      const screens = { '/': <TodayPageClient initialToday="2026-09-12" initialHabits={null} initialProfile={profile} />, '/calendar': <CalendarPage />, '/progress': <ProgressPage />, '/profile': <ProfilePage /> };
      return <DestinationShell onCreate={() => setCreating(true)}>{screens[configuration.route]}{creating ? <CreateHabitModal onClose={() => setCreating(false)} /> : null}</DestinationShell>;
    }
    createRoot(document.getElementById('root')).render(<QueryClientProvider client={client}><NextIntlClientProvider locale={configuration.locale} messages={configuration.locale === 'en' ? en : ptBR} timeZone="UTC"><PreloadedProfileContext.Provider value={profile}><TodayProvider><Destination /></TodayProvider></PreloadedProfileContext.Provider></NextIntlClientProvider></QueryClientProvider>);`, {
    'server-only': '',
    'next/link': "import React from 'react'; export default function Link({ onNavigate, prefetch, ...props }) { return React.createElement('a', props); }",
    'next/navigation': `const configuration = JSON.parse(document.getElementById('configuration').textContent); const router = { push: () => {}, replace: () => {}, back: () => {}, refresh: () => {}, prefetch: () => {} }; const parameters = new URLSearchParams(); export const useRouter = () => router; export const usePathname = () => configuration.route; export const useParams = () => ({}); export const useSearchParams = () => parameters; export { unstable_isUnrecognizedActionError } from 'next/dist/client/components/unrecognized-action-error';`,
    'next/headers': 'export const cookies = async () => ({ get: () => undefined }); export const headers = async () => new Headers();',
    '@/lib/server-fetch': `const read = async path => (await window.surfaceFixture(path)).body; export const serverAuthFetch = read; export const serverRenderFetch = read; export const serverPublicFetch = read; export const serverAuthMutate = async () => { throw new Error('Surface inspection does not submit mutations'); };`,
  })
}

type Interaction = 'hover' | 'press' | 'focus'
let nextScope = 0

async function reachInteraction(page: Page, control: Locator, state: Interaction) {
  await control.scrollIntoViewIfNeeded()
  const outside = await control.evaluate(element => {
    const box = element.getBoundingClientRect()
    return box.bottom <= 0 || box.top >= innerHeight || box.right <= 0 || box.left >= innerWidth
  })
  if (state !== 'focus' && outside) return false
  if (state === 'focus') { await page.keyboard.press('Shift'); await control.focus() }
  else { await control.hover(); if (state === 'press') await page.mouse.down() }
  await control.evaluate(() => new Promise<void>(done => requestAnimationFrame(() => done())))
  await control.evaluate(settleAnimations)
  return true
}

async function assertSurface(control: Locator, state: Interaction, assert: typeof expect) {
  const geometry = await control.evaluate(inspectInteractionSurface, INTERACTION_FILL_CLEARANCE)
  const ancestors = geometry.violations.length ? await control.evaluate(element => {
    const rows = []
    for (let node: Element | null = element; node; node = node.parentElement) {
      const bounds = node.getBoundingClientRect()
      rows.push({ tag: node.tagName, test: node.getAttribute('data-testid'), role: node.getAttribute('role'), width: bounds.width, left: bounds.left, padding: getComputedStyle(node).paddingInline })
    }
    return rows
  }) : []
  assert.soft(geometry.violations, JSON.stringify({ state, geometry, ancestors })).toEqual([])
  if (geometry.centering) {
    assert.soft(geometry.centering.inline, `${geometry.control} ${state} inline centre`).toBeLessThanOrEqual(0.5)
    assert.soft(geometry.centering.block, `${geometry.control} ${state} block centre`).toBeLessThanOrEqual(0.5)
  }
}

async function inspectOpenedOverlay(page: Page, control: Locator, visited: Set<string>, assert: typeof expect) {
  const popup = page.locator('[role="dialog"], [role="menu"]').last()
  const insidePopup = await control.evaluate(element => Boolean(element.closest('[role="dialog"], [role="menu"]')))
  if (!await popup.isVisible() || insidePopup) return
  await popup.evaluate(settleAnimations)
  const identity = await popup.getAttribute('id') ?? await popup.innerText()
  if (!visited.has(identity)) { visited.add(identity); await inspectDiscoveredControls(page, popup, assert, visited) }
  await page.keyboard.press('Escape')
  await popup.waitFor({ state: 'hidden', timeout: 3000 })
}

async function inspectDiscoveredControls(page: Page, scope: Locator, assert: typeof expect, visited = new Set<string>()) {
  const prefix = String(nextScope++)
  const discovered = scope.locator(controls)
  await discovered.evaluateAll((elements, prefix) => elements.forEach((element, index) => element.setAttribute('data-surface-control', `${prefix}-${index}`)), prefix)
  const count = await discovered.count()
  let inspected = 0
  for (let index = 0; index < count; index++) {
    const control = scope.locator(`[data-surface-control="${prefix}-${index}"]`)
    if (!await control.isVisible() || await control.getAttribute('aria-disabled') === 'true') continue
    if (await control.evaluate(element => element.matches('[data-base-ui-focus-guard], [data-radix-focus-guard]'))) continue
    for (const state of ['hover', 'press', 'focus'] as const) {
      if (!await reachInteraction(page, control, state)) continue
      await assertSurface(control, state, assert)
      await page.mouse.move(0, 0)
      await page.mouse.up()
      await control.blur()
      await inspectOpenedOverlay(page, control, visited, assert)
    }
    inspected++
  }
  return inspected
}

export function registerInteractionSurfaceSweep(cases: readonly SweepCase[], registerChromeLaunchHook: typeof RegisterChromeLaunchHook, guardRegressions = false) {
  describe('destination and sheet interaction surface sweep', () => {
    let browser: Browser
    let launch: BrowserLaunch | undefined
    let stylesheet: string
    let script: string
    let fixture: Awaited<ReturnType<typeof createHermeticFixtureRequest>>
    registerChromeLaunchHook(beforeAll, async pending => { launch = pending; browser = await pending })
    beforeAll(async () => {
      fixture = await createHermeticFixtureRequest()
      const source = resolve('app/globals.css')
      stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
      script = bundleDestinations()
    })
    afterAll(async () => { await closeChrome(launch) }, 30_000)

    if (guardRegressions) {
    it('measures foreground neighbours independently from the modal backdrop', async () => {
      const page = await browser.newPage({ viewport: { width: 320, height: 640 } })
      try {
        await page.setContent('<button style="position:fixed;inset:0;background:grey">Backdrop</button><div role="dialog" style="position:fixed;inset:16px;background:white"><button id="action" style="position:absolute;left:16px;top:16px;width:48px;height:48px;border:0;background:grey">Action</button><span id="neighbour" style="position:absolute;left:72px;top:32px">Neighbour</span></div>')
        const action = page.locator('#action')
        expect((await action.evaluate(inspectInteractionSurface, INTERACTION_FILL_CLEARANCE)).violations).toEqual([])
        await page.locator('#neighbour').evaluate(element => element.style.left = '68px')
        expect((await action.evaluate(inspectInteractionSurface, INTERACTION_FILL_CLEARANCE)).violations).toContainEqual({ neighbour: 'span#neighbour[Neighbour]', distance: 4 })
      } finally { await page.close() }
    })

    it('measures the tab focus perimeter without changing its styles', async () => {
      const page = await browser.newPage({ viewport: { width: 320, height: 640 } })
      try {
        const variables = Object.entries(resolveWebThemeVariables('orange', 'dark')).map(([key, value]) => `${key}:${value}`).join(';')
        await page.setContent(`<html class="dark" style="${variables}"><style>${stylesheet}</style><body><div data-shell-column style="padding-top:400px"><a href="/" class="orbit-tab relative block h-20 w-20">Today</a></div></body></html>`)
        const tab = page.locator('a')
        for (const state of ['hover', 'press'] as const) {
          await reachInteraction(page, tab, state)
          await tab.evaluate(inspectInteractionSurface, INTERACTION_FILL_CLEARANCE)
          await page.mouse.move(0, 0)
          await page.mouse.up()
          await tab.blur()
        }
        await page.keyboard.press('Shift')
        await tab.focus()
        const before = await tab.evaluate(element => { const style = getComputedStyle(element, '::after'); return { outline: style.outline, offset: style.outlineOffset } })
        const geometry = await tab.evaluate(inspectInteractionSurface, INTERACTION_FILL_CLEARANCE)
        const after = await tab.evaluate(element => { const style = getComputedStyle(element, '::after'); return { outline: style.outline, offset: style.outlineOffset } })
        expect(after).toEqual(before)
        expect(geometry.violations, JSON.stringify({ before, after, geometry })).toEqual([])
      } finally { await page.close() }
    })

    }

    it.concurrent.for(cases)('discovers every rendered control at $width in $locale, collapsed=$collapsed on $route', { timeout: 120_000 }, async ({ width, locale, collapsed, route }, { expect }) => {
        const page = await browser.newPage({ viewport: { width, height: 1100 }, reducedMotion: 'reduce' })
        page.setDefaultTimeout(3000)
        const failures: string[] = []
        page.on('pageerror', failure => failures.push(failure.message))
        await page.exposeFunction('surfaceFixture', (path: string) => fixture(path.replace(/^\/api\/proxy/, '')))
        try {
          const variables = Object.entries(resolveWebThemeVariables('orange', 'dark')).map(([key, value]) => `${key}:${value}`).join(';')
          await page.setContent(`<!doctype html><html class="dark" lang="${locale}" style="${variables}"><head><base href="https://surface.example.test"><style>${stylesheet}</style></head><body><div id="root"></div><script id="configuration" type="application/json">${JSON.stringify({ route, locale, collapsed })}</script></body></html>`)
          await page.evaluate(() => {
            let cookie = ''
            Object.defineProperty(document, 'cookie', { configurable: true, get: () => cookie, set: value => { cookie = value } })
            for (const name of ['localStorage', 'sessionStorage']) {
              const entries = new Map<string, string>()
              Object.defineProperty(window, name, { configurable: true, value: { getItem: (key: string) => entries.get(key) ?? null, setItem: (key: string, value: string) => entries.set(key, value), removeItem: (key: string) => entries.delete(key), clear: () => entries.clear(), key: (index: number) => [...entries.keys()][index] ?? null, get length() { return entries.size } } })
            }
          })
          await page.addScriptTag({ content: script })
          await expect.poll(() => failures).toEqual([])
          await page.locator('[data-shell-column]').waitFor({ timeout: 3000 }).catch(async cause => {
            throw new Error(JSON.stringify({ route, failures, rendered: await page.locator('#root').innerHTML() }), { cause })
          })
          await page.waitForFunction('window.surfaceClient.isFetching() === 0')
          await loadAppFonts(page)
          expect(failures, route).toEqual([])
          expect(await inspectDiscoveredControls(page, page.locator('body'), expect), route).toBeGreaterThan(0)
          const entries = await page.locator('button:has(svg), [aria-haspopup="dialog"], [aria-haspopup="menu"]').all()
          for (const entry of entries) {
            if (!await entry.isVisible() || !await entry.isEnabled()) continue
            await entry.click()
            await page.evaluate(() => new Promise<void>(done => requestAnimationFrame(() => requestAnimationFrame(() => done()))))
            const overlay = page.locator('[role="dialog"], [role="menu"]').last()
            if (await overlay.isVisible()) {
              await overlay.evaluate(settleAnimations)
              expect(await inspectDiscoveredControls(page, overlay, expect)).toBeGreaterThan(0)
              await page.keyboard.press('Escape')
            }
          }
          expect(failures, route).toEqual([])
        } finally { await page.mouse.up(); await page.close() }
    })
  })
}

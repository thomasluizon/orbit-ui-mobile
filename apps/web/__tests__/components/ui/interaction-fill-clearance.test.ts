import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { execFile } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createElement } from 'react'
import { render } from '@testing-library/react'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { setTimeout as delay } from 'node:timers/promises'
import type { Locator, Page } from '@playwright/test'
import { INTERACTION_FILL_CLEARANCE } from '@orbit/shared/theme'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import en from '@orbit/shared/i18n/en.json'
import { RadioOptionFixture } from '@/__tests__/support/radio-option-fixture'
import { resolveWebThemeVariables } from '@/lib/theme-dom'
import { loadAppFonts } from '@/__tests__/support/app-fonts'
import { inspectInteractionFill } from '@/e2e/layout/interaction-fill-geometry'
import { inspectControls } from '@/e2e/layout/interaction-fill-states'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

const FIXTURE_TIMEOUT_MS = 5000

async function reachOptionState(page: Page, row: Locator, state: 'hover' | 'press' | 'focus') {
  if (state === 'focus') { await page.mouse.move(0, 0); await page.keyboard.press('Tab'); await row.focus() }
  else { await row.hover(); if (state === 'press') await page.mouse.down() }
}

async function within<Result>(description: string, action: () => Promise<Result>, timeout = FIXTURE_TIMEOUT_MS): Promise<Result> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      action(),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(`${description} exceeded ${timeout}ms`)), timeout) }),
    ])
  } finally { clearTimeout(timer) }
}

function compileFixture(source: string, input = '', timeout = FIXTURE_TIMEOUT_MS): Promise<string> {
  return new Promise((resolve, reject) => {
    const compiler = execFile(process.execPath, ['--input-type=module', '-e', source], {
      encoding: 'utf8', maxBuffer: 10 * 1024 * 1024, timeout, killSignal: 'SIGKILL',
    }, (cause, script) => {
      if (cause) reject(new Error(`Fixture compiler failed or exceeded ${timeout}ms`, { cause }))
      else resolve(script)
    })
    compiler.stdin!.end(input)
  })
}

describe('interaction clearance inspector in Chromium', () => {
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string
  registerChromeLaunchHook(beforeAll, async (launch) => { browserLaunch = launch; browser = await launch })
  beforeAll(async () => {
    const source = resolve('app/globals.css')
    stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
  })
  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

  async function withPage(options: Parameters<Browser['newPage']>[0], inspect: (page: Page) => Promise<void>) {
    const page = await within('Create Chromium fixture page', () => browser.newPage(options))
    page.setDefaultTimeout(FIXTURE_TIMEOUT_MS)
    try { await within('Chromium fixture setup and inspection', () => inspect(page), 10_000) }
    finally { await within('Close Chromium fixture page', () => page.close()) }
  }

  it.each([320, 360, 384, 412, 600, 1024, 1352].flatMap(width => (['light', 'dark'] as const).flatMap(mode =>
    (['en', 'pt-BR'] as const).map(locale => ({ width, mode, locale })))))(
    'clears interactive option rows beside selected rows at $width in $mode and $locale', async ({ width, mode, locale }) => {
      const messages = locale === 'en' ? en : ptBR
      const words = messages.habits.form
      const { container, unmount } = render(createElement(RadioOptionFixture, { locale }))
      try {
        await withPage({ viewport: { width, height: 915 }, reducedMotion: 'reduce' }, async page => {
          const variables = Object.entries(resolveWebThemeVariables('orange', mode)).map(([key, value]) => `${key}:${value}`).join(';')
          await page.setContent(`<html class="${mode}" style="${variables}"><style>${stylesheet} *, *::before, *::after { transition: none !important }</style>${container.innerHTML}</html>`)
          await loadAppFonts(page)
          for (const label of [words.typeTask, words.every]) {
            const row = page.getByRole('radio', { name: label, exact: true })
            const next = page.getByRole('radio', { name: label === words.typeTask ? words.typeHabit : words.timesPerUnit, exact: true })
            expect(await next.getAttribute('aria-checked')).toBe('true')
            for (const state of ['hover', 'press', 'focus'] as const) {
              await reachOptionState(page, row, state)
              const result = await row.evaluate(inspectInteractionFill, INTERACTION_FILL_CLEARANCE)
              expect(result.hasFill).toBe(true)
              expect(result.violations, `${label}, ${state}`).toEqual([])
              const currentBounds = (await row.boundingBox())!
              const nextBounds = (await next.boundingBox())!
              expect(nextBounds.y - currentBounds.y - currentBounds.height).toBeGreaterThanOrEqual(INTERACTION_FILL_CLEARANCE)
              expect(currentBounds.x).toBe(nextBounds.x)
              expect(currentBounds.width).toBe(nextBounds.width)
              const labelFits = await row.locator('[data-slot="list-row-title"]').evaluate(element => {
                const style = getComputedStyle(element)
                return element.getBoundingClientRect().height <= parseFloat(style.lineHeight) + 1 && element.scrollWidth <= element.clientWidth
              })
              expect(labelFits).toBe(true)
              if (state === 'press') { await page.mouse.move(0, 0); await page.mouse.up() }
            }
          }
        })
      } finally { unmount() }
    })

  it('inspects disjoint option inventories consecutively on the same page', async () => {
    await withPage({ viewport: { width: 320, height: 915 } }, async page => {
      await page.setContent(`<style>body { display:flex;gap:32px;padding:32px }
        button { padding:16px;border:0;background:gray;outline:none }</style><button>First</button><button>Second</button>`)
      const counts = { inspectedControls: 0, skippedSentinels: 0 }
      for (const name of ['First', 'Second']) {
        await inspectControls(page, page.getByRole('button', { name, exact: true }), 'sequential inventories', INTERACTION_FILL_CLEARANCE, counts)
      }
      expect(counts).toEqual({ inspectedControls: 2, skippedSentinels: 0 })
      expect(await page.locator('[data-interaction-fill-probe]').count()).toBe(0)
    })
  })

  it('fails a stalled fixture compiler with a bounded error', async () => {
    await expect(compileFixture('await new Promise(resolve => setTimeout(resolve, 10_000)); process.stdout.write("late")', '', 250))
      .rejects.toThrow('Fixture compiler failed or exceeded 250ms')
  })

  it.each([
    { position: 'top: -80px', heldLoad: false },
    { position: 'top: 0; transform: translateY(-200%)', heldLoad: false },
    { position: 'top: -80px', heldLoad: true },
  ])('measures only reachable focus paint for an off-canvas control ($position, held load: $heldLoad)', async ({ position, heldLoad }) => {
    await withPage({ viewport: { width: 320, height: 915 } }, async page => {
      let fixtureLoadReleased = false
      if (heldLoad) await page.route('https://fixture.test/held-load.svg', async route => {
        await delay(500)
        fixtureLoadReleased = true
        await route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1" />' })
      })
      await page.setContent(`<style>
        a { position: fixed; left: 32px; padding: 8px; ${position} }
        a:focus-visible { top: 16px; transform: none; background: gray; outline: none }
      </style><a href="#content">Keyboard entry</a><main id="content" style="margin-top: 160px">Content</main>${heldLoad ? '<img hidden src="https://fixture.test/held-load.svg">' : ''}`)
      if (heldLoad) {
        expect(fixtureLoadReleased, 'setContent must wait for the delayed fixture load').toBe(true)
        expect(await page.locator('img').evaluate(image => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0)).toBe(true)
      }
      await page.evaluate(() => {
        for (const event of ['pointerenter', 'pointerdown', 'focus']) document.querySelector('a')!.addEventListener(event, () => {
          document.body.dataset[event] = String(Number(document.body.dataset[event] ?? 0) + 1)
        })
      })
      page.setDefaultTimeout(250)
      await inspectControls(page, page.locator('a'), '/habits/habit-1, 320px, en', INTERACTION_FILL_CLEARANCE)
      expect(await page.locator('body').getAttribute('data-pointerenter')).toBeNull()
      expect(await page.locator('body').getAttribute('data-pointerdown')).toBeNull()
      expect(Number(await page.locator('body').getAttribute('data-focus'))).toBeGreaterThan(0)
    })
  })

  it('reports a blocked pointer action with the route, width, locale and control', async () => {
    await withPage({ viewport: { width: 412, height: 915 } }, async page => {
      page.setDefaultTimeout(120_000)
      await page.setContent('<button>Blocked control</button><div style="position: fixed; inset: 0; background: white"></div>')
      await expect(inspectControls(page, page.locator('button'), '/settings, 412px, pt-BR', INTERACTION_FILL_CLEARANCE))
        .rejects.toThrow(/\/settings, 412px, pt-BR.*button\[Blocked control\].*hover/)
      expect(await page.locator('[data-interaction-fill-probe]').count()).toBe(0)
    })
  }, 5000)

  it('sets keyboard modality without entering an input that replaces the measured control', async () => {
    await withPage({ viewport: { width: 320, height: 915 } }, async page => {
      await page.setContent(`<style>button { padding:16px;border:0;background:gray;outline:none }
        input { display:block;margin-top:32px }</style><button>Open the conversation</button><input aria-label="Message">`)
      await page.locator('input').evaluate((input) => input.addEventListener('focus', () => {
        document.body.dataset.inputFocused = 'true'
        document.querySelector('button')!.remove()
      }))
      await inspectControls(page, page.getByRole('button'), '/, 320px, en', INTERACTION_FILL_CLEARANCE)
      expect(await page.locator('body').getAttribute('data-input-focused')).toBeNull()
    })
  })

  it.each(['pending', 'keyboard'] as const)('dismisses the account menu before measuring keyboard focus when loading is %s', async loading => {
    await withPage({ viewport: { width: 1024, height: 915 }, reducedMotion: 'reduce' }, async page => {
      const script = await compileFixture(`
        import { build, stop } from 'esbuild';
        import { readFileSync } from 'node:fs';
        import { readFile } from 'node:fs/promises';
        const result = await build({
          stdin: { contents: readFileSync(0, 'utf8'), resolveDir: process.cwd(), loader: 'tsx' },
          bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic',
          alias: { '@sentry/nextjs': '@sentry/browser' },
          define: { 'process.env.NODE_ENV': '"production"', 'process.env': '{}' },
          plugins: [{ name: 'account-menu-loading-boundary', setup(builder) {
            builder.onLoad({ filter: /[/\\\\]dropdown-menu\\.tsx$/ }, async args => {
              const source = await readFile(args.path, 'utf8');
              const contents = source.replace("loadingContent ??= import('./dropdown-menu-content')", "loadingContent ??= window.accountMenuReady.then(() => import('./dropdown-menu-content'))");
              if (contents === source) throw new Error('Account menu loading boundary was not found');
              return { contents, loader: 'tsx' };
            });
            builder.onResolve({ filter: /^@\\/stores\\/auth-store$/ }, args => ({ path: args.path, namespace: 'account-session' }));
            builder.onLoad({ filter: /.*/, namespace: 'account-session' }, () => ({ contents: 'export const useAuthStore = selector => selector({ logout: () => {} });', loader: 'js' }));
          } }],
        });
        process.stdout.write(result.outputFiles[0].text);
        stop();
      `, `import React from 'react'; import { createRoot } from 'react-dom/client';
        import { NextIntlClientProvider } from 'next-intl'; import { SidebarAccount } from './components/shell/sidebar-account';
        window.accountMenuReady = new Promise(resolve => { window.releaseAccountMenu = resolve });
        document.addEventListener('keydown', event => { if (event.key === 'Shift' && ${JSON.stringify(loading)} === 'keyboard') window.releaseAccountMenu() });
        createRoot(document.getElementById('root')).render(<NextIntlClientProvider locale="pt-BR" messages={${JSON.stringify(ptBR)}}>
          <SidebarAccount account="Orbit Preview" accountEmail="preview@example.test" collapsed={false} />
        </NextIntlClientProvider>);`)
      await page.setContent(`<style>
        #root { margin:32px;width:184px }
        button { padding:16px;border:0;background:gray;outline:none }
        button:focus-visible { outline:2px solid black;outline-offset:2px }
      </style><div id="root"></div>`)
      await page.addScriptTag({ content: script })
      const account = page.getByRole('button', { name: 'Orbit Preview, preview@example.test', exact: true })
      await account.waitFor({ timeout: FIXTURE_TIMEOUT_MS })
      expect(await inspectControls(page, account, '/r/invalid, 1024px, pt-BR', INTERACTION_FILL_CLEARANCE))
        .toEqual({ inspectedControls: 1, skippedSentinels: 0 })
      expect(await account.getAttribute('aria-expanded')).toBe('false')
      await page.evaluate('window.releaseAccountMenu()')
      await within('Settle account menu loading frames', () => page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))))
      expect(await page.locator('[role="menu"]').count()).toBe(0)
    })
  })

  it('measures a focus-opened conversation and restores the remaining control inventory', async () => {
    await withPage({ viewport: { width: 320, height: 915 } }, async page => {
      await page.setContent(`<style>section, [role="dialog"] { padding:32px } [role="dialog"] { position:fixed;inset:0;background:white }
        button, textarea { padding:8px;border:0;outline:none;background:gray } textarea { display:block;margin:32px 0 }</style>
        <section><button>Open the conversation</button><textarea aria-label="Message"></textarea><button>Add</button></section>`)
      await page.locator('textarea').evaluate((input) => input.addEventListener('focus', () => {
        const section = document.querySelector('section')!
        section.style.visibility = 'hidden'
        const dialog = document.createElement('div')
        dialog.setAttribute('role', 'dialog')
        dialog.innerHTML = '<textarea aria-label="Conversation message"></textarea>'
        document.body.append(dialog)
        dialog.querySelector('textarea')!.focus()
        document.addEventListener('keydown', function close(event) {
          if (event.key !== 'Escape') return
          dialog.remove()
          section.style.visibility = ''
          document.removeEventListener('keydown', close)
        })
      }))
      const counts = await inspectControls(page, page.locator('section :is(button, textarea):visible'), '/, 320px, en', INTERACTION_FILL_CLEARANCE)
      expect(counts).toEqual({ inspectedControls: 3, skippedSentinels: 0 })
      expect(await page.getByRole('dialog').count()).toBe(0)
      expect(await page.getByRole('button', { name: 'Add' }).isVisible()).toBe(true)
    })
  })

  it.each([false, true])('skips installed dialog focus guards without skipping a real collision (collision=%s)', async (collision) => {
    await withPage({ viewport: { width: 1024, height: 915 } }, async page => {
      const options = {
        stdin: { contents: `import React from 'react'; import { createRoot } from 'react-dom/client'; import { Dialog } from '@base-ui/react/dialog';
          createRoot(document.getElementById('root')).render(<Dialog.Root open modal disablePointerDismissal><Dialog.Portal><Dialog.Viewport><Dialog.Popup aria-label="Onboarding"><input aria-label="Habit" autoFocus /><button>I already have an account</button><p>Neighbour</p></Dialog.Popup></Dialog.Viewport></Dialog.Portal></Dialog.Root>);`,
        resolveDir: process.cwd(), loader: 'tsx' },
        bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' },
      }
      const script = await compileFixture(`import { build, stop } from 'esbuild'; const result = await build(${JSON.stringify(options)}); process.stdout.write(result.outputFiles[0].text); stop();`)
      await page.setContent(`<style>[role="dialog"] { position:fixed;inset:0;display:flex;flex-direction:column;gap:32px;padding:32px }
        button { position:relative;padding:16px;border:0;outline:none } button:focus-visible { background:gray } p { margin:0 }
        ${collision ? "button::before { content:'';position:absolute;inset:0 0 -32px;background:gray }" : ''}</style><div id="root"></div>`)
      await page.addScriptTag({ content: script })
      await page.getByRole('dialog').waitFor({ timeout: FIXTURE_TIMEOUT_MS })
      const counts = { inspectedControls: 0, skippedSentinels: 0 }
      const inspection = inspectControls(page, page.locator('button, input, [data-base-ui-focus-guard]'), '/onboarding, 1024px, en', INTERACTION_FILL_CLEARANCE, counts)
      if (collision) await expect(inspection).rejects.toThrow(/button\[I already have an account\].*hover[\s\S]*p\[Neighbour\]/)
      else { await inspection; expect(counts.inspectedControls).toBe(2); expect(counts.skippedSentinels).toBeGreaterThan(0) }
    })
  })

  it('reports a control that remains off-canvas after focus', async () => {
    await withPage({ viewport: { width: 320, height: 915 } }, async page => {
      await page.setContent('<a href="#content" style="position: fixed; top: -80px">Hidden entry</a>')
      page.setDefaultTimeout(250)
      await expect(inspectControls(page, page.locator('a'), '/settings, 320px, en', INTERACTION_FILL_CLEARANCE))
        .rejects.toThrow(/\/settings, 320px, en.*a\[Hidden entry\].*focus-visible.*outside the viewport/)
    })
  })

  it('rejects a focus-revealed control that is only partly inside the viewport', async () => {
    await withPage({ viewport: { width: 320, height: 915 } }, async page => {
      await page.setContent(`<style>a { position:fixed;left:32px;top:-80px;width:160px;height:48px }
        a:focus-visible { top:-4px;background:gray;outline:none }</style><a href="#content">Keyboard entry</a>`)
      await expect(inspectControls(page, page.locator('a'), '/settings, 320px, en', INTERACTION_FILL_CLEARANCE))
        .rejects.toThrow(/focus-visible.*outside the viewport/)
    })
  })

  it('scrolls an ordinary control into view and measures hover, held press and keyboard focus without activation', async () => {
    await withPage({ viewport: { width: 320, height: 915 } }, async page => {
      await page.setContent(`<style>
        button { margin-top: 1200px; padding: 8px; border: 0; background: transparent; outline: none }
        button:hover, button:active, button:focus-visible { background: gray }
      </style><button>Scrollable control</button>`)
      await page.evaluate(() => {
        const button = document.querySelector('button')!
        for (const event of ['pointerenter', 'pointerdown', 'pointerup', 'focus', 'click']) button.addEventListener(event, () => {
          document.body.dataset[event] = String(Number(document.body.dataset[event] ?? 0) + 1)
        })
      })
      await inspectControls(page, page.locator('button'), '/settings, 320px, en', INTERACTION_FILL_CLEARANCE)
      for (const event of ['pointerenter', 'pointerdown', 'focus']) {
        expect(Number(await page.locator('body').getAttribute(`data-${event}`))).toBeGreaterThan(0)
      }
      expect(await page.locator('body').getAttribute('data-pointerup')).toBeNull()
      expect(await page.locator('body').getAttribute('data-click')).toBeNull()
    })
  })

  it('measures the revealed focus fill against neighbours', async () => {
    await withPage({ viewport: { width: 320, height: 915 } }, async page => {
      await page.setContent(`<style>
        a { position: fixed; left: 32px; top: -80px; width: 160px; height: 48px }
        a:focus-visible { top: 16px; background: gray; outline: none }
        section { position: fixed; inset: 0 }
        a { position: absolute }
        p { position: absolute; left: 32px; top: 64px; margin: 0 }
      </style><section><a href="#content">Keyboard entry</a><p>Focus neighbour</p></section>`)
      await expect(inspectControls(page, page.locator('a'), '/settings, 320px, en', INTERACTION_FILL_CLEARANCE))
        .rejects.toThrow(/\/settings, 320px, en.*a\[Keyboard entry\].*focus-visible[\s\S]*p\[Focus neighbour\]/)
    })
  })

  it.each(['document', 'fixed control', 'fixed parent', 'nested fixed parent'])('ignores overlapping paint in another layer for a %s', async (layer) => {
    await withPage({ viewport: { width: 320, height: 915 } }, async page => {
      const control = `<button style="${layer === 'fixed control' ? 'position:fixed;' : ''}left:32px;top:32px">Control</button>`
      const content = layer === 'document' || layer === 'fixed control' ? control
        : `<section style="position:fixed;inset:0">${layer === 'nested fixed parent' ? `<article style="position:fixed;inset:0">${control}</article>` : control}</section>`
      await page.setContent(`<style>button { position:absolute;width:160px;height:48px;background:gray;border:0;outline:none }
        aside { position:${layer === 'document' ? 'fixed' : 'absolute'};left:32px;top:32px;width:160px;height:48px;background:black }
        p { position:absolute;left:32px;top:32px;margin:0 }</style>${content}<aside><p>Other layer</p></aside>`)
      const result = await page.getByRole('button').evaluate(inspectInteractionFill, INTERACTION_FILL_CLEARANCE)
      expect(result.hasFill).toBe(true)
      expect(result.violations).toEqual([])
    })
  })

  it.each([false, true])('separates clipped shell content from pinned chrome while retaining same-region neighbours (collision=%s)', async (collision) => {
    await withPage({ viewport: { width: 320, height: 915 } }, async page => {
      await page.setContent(`<style>button { position:absolute;left:32px;top:32px;width:160px;height:48px;background:gray;border:0;outline:none }
        [data-shell-bottom] { position:relative;background:black;height:80px } p { position:absolute;left:32px;top:80px;margin:0 }</style>
        <main data-shell-scroller><button>Child row</button>${collision ? '<p>Same scroller</p>' : ''}</main>
        <div data-shell-bottom><nav>Today Calendar Progress Profile</nav><div>Ask Astra</div></div>`)
      const result = await page.getByRole('button').evaluate(inspectInteractionFill, INTERACTION_FILL_CLEARANCE)
      expect(result.violations).toEqual(collision ? [{ neighbour: 'p[Same scroller]', distance: 0 }] : [])
    })
  })

  it.each(['own decoration', 'external decoration', 'visible graphic', 'interactive graphic'])('only excludes the field own decorative SVG: %s', async (kind) => {
    await withPage({ viewport: { width: 320, height: 915 } }, async page => {
      const svg = `<svg ${kind === 'visible graphic' ? '' : 'aria-hidden="true"'} ${kind === 'interactive graphic' ? 'role="button" tabindex="0"' : ''} style="position:absolute;left:160px;top:40px;width:24px;height:24px;pointer-events:none"></svg>`
      await page.setContent(`<style>input { margin:32px;width:160px;height:48px;background:gray;border:0;outline:none }</style>
        <div><input class="orbit-field-hover" aria-label="Search habits">${kind === 'external decoration' ? '' : svg}</div>${kind === 'external decoration' ? svg : ''}`)
      const result = await page.getByRole('textbox').evaluate(inspectInteractionFill, INTERACTION_FILL_CLEARANCE)
      expect(result.violations.some((violation) => violation.neighbour === 'svg[]')).toBe(kind !== 'own decoration')
    })
  })

  it.each([false, true])('counts real focus guards even when a later control fails (collision=%s)', async (collision) => {
    await withPage({ viewport: { width: 320, height: 915 } }, async page => {
      const options = {
        stdin: { contents: `import React from 'react'; import { createRoot } from 'react-dom/client';
          import { FocusGuards } from '@radix-ui/react-focus-guards'; import { FocusScope } from '@radix-ui/react-focus-scope';
          createRoot(document.getElementById('root')).render(<FocusGuards><FocusScope trapped loop><button>Dialog action</button><p>Neighbour</p></FocusScope></FocusGuards>);`,
        resolveDir: process.cwd(), loader: 'tsx' },
        bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic',
        define: { 'process.env.NODE_ENV': '"production"' },
      }
      const script = await compileFixture(`import { build, stop } from 'esbuild'; const result = await build(${JSON.stringify(options)}); process.stdout.write(result.outputFiles[0].text); stop();`)
      await page.setContent(`<style>span[tabindex="0"] { top:-80px;width:8px;height:8px }
        #root > div { display:flex;flex-direction:column;gap:32px;padding:32px }
        button { position:relative;padding:8px;outline:none } p { margin:0 }
        ${collision ? "button::before { content:'';position:absolute;inset:0 0 -32px;background:gray }" : ''}</style><div id="root"></div>`)
      await page.addScriptTag({ content: script })
      await page.waitForFunction(() => document.querySelectorAll('body > span[tabindex="0"]').length === 2, undefined, { timeout: FIXTURE_TIMEOUT_MS })
      const counts = { inspectedControls: 0, skippedSentinels: 0 }
      const inspection = inspectControls(page, page.locator('button, span[tabindex="0"]'), '/onboarding, 320px, en', INTERACTION_FILL_CLEARANCE, counts)
      if (collision) {
        await expect(inspection).rejects.toThrow(/button\[Dialog action\].*hover[\s\S]*p\[Neighbour\]/)
        expect(counts).toEqual({ inspectedControls: 0, skippedSentinels: 1 })
      } else {
        await inspection
        expect(counts).toEqual({ inspectedControls: 1, skippedSentinels: 2 })
      }
    })
  })

  it.each([
    { width: 320, locale: 'en' }, { width: 412, locale: 'en' },
    { width: 320, locale: 'pt-BR' }, { width: 412, locale: 'pt-BR' },
  ])('reports the habit title against its frequency summary before earlier controls at $width in $locale', async ({ width, locale }) => {
    await withPage({ viewport: { width, height: 915 } }, async page => {
      await page.setContent(`<style>
        body { margin: 32px } a { position: fixed; top: -100px }
        button { position: relative; display: block; width: 160px; height: 48px; padding: 0; border: 0; outline: none; background: transparent }
        .emoji { width: 76px; height: 76px; margin-bottom: 12px; background: gray }
        .orbit-habit-rename::before { content: ''; position: absolute; inset: -8px -16px; opacity: 0; background: gray }
        .orbit-habit-rename:hover::before { opacity: 1 }
        p { margin: 4px 0 0 }
      </style><a href="#content">Keyboard entry</a><button class="emoji" aria-label="Emoji well">📖</button>
      <button class="orbit-habit-rename">Habit title</button><p>Frequency summary</p>`)
      await expect(inspectControls(page, page.locator('a, button'), `/habits/habit-1, ${width}px, ${locale}`, INTERACTION_FILL_CLEARANCE))
        .rejects.toThrow(new RegExp(`/habits/habit-1, ${width}px, ${locale}.*button\\.orbit-habit-rename\\[Habit title\\].*hover[\\s\\S]*p\\[Frequency summary\\]`))
    })
  })

  it.each([
    { paint: 'background: gray', gap: 4, extension: 8, fails: true },
    { paint: 'background: gray', gap: 16, extension: 8, fails: false },
    { paint: 'background: transparent', gap: 4, extension: 8, fails: false },
    { paint: 'background: gray; opacity: 0', gap: 4, extension: 8, fails: false },
    { paint: 'background: gray; box-shadow: 0 0 0 100px transparent', gap: 16, extension: 8, fails: false },
    { paint: 'background: gray; outline: 2px solid black; outline-offset: 2px', gap: 16, extension: 8, fails: true },
  ])('measures $paint with a $gap gap and $extension extension', async ({ paint, gap, extension, fails }) => {
    await withPage({ viewport: { width: 320, height: 915 } }, async page => {
      await page.setContent(`<style>
        body { margin: 32px; display: flex; flex-direction: column; gap: ${gap}px }
        button { position: relative; height: 48px; width: 160px; background: transparent; border: 0; outline: none }
        button::before { content: ''; position: absolute; inset: -${extension}px; ${paint} }
        p { margin: 0; height: 16px }
      </style><button aria-label="Rename">Title</button><p>Frequency</p>`)
      const result = await page.getByRole('button').evaluate(inspectInteractionFill, INTERACTION_FILL_CLEARANCE)
      expect(result.violations.some((violation) => violation.neighbour === 'p[Frequency]')).toBe(fails)
    })
  })

  it('measures both painted pseudos while ignoring the control contents and structural wrappers', async () => {
    await withPage({ viewport: { width: 320, height: 915 } }, async page => {
      await page.setContent(`<style>
        body { margin: 32px } button { position: relative; width: 160px; height: 48px; border: 0; outline: none }
        button::before { content: ''; position: absolute; inset: -4px; background: gray }
        button::after { content: ''; position: absolute; inset: -8px; border: 2px solid black }
      </style><section><div><button aria-label="Rename"><span>Title</span></button></div></section>`)
      const result = await page.getByRole('button').evaluate(inspectInteractionFill, INTERACTION_FILL_CLEARANCE)
      expect(result.fill).toEqual({ left: 24, top: 24, right: 200, bottom: 88 })
      expect(result.violations).toEqual([])
    })
  })

  it.each([
    { clip: 'clip-path: inset(50%)', visible: false },
    { clip: 'clip: rect(0, 0, 0, 0)', visible: false },
    { clip: 'clip: rect(0, 89px, 20px, 0)', visible: true },
  ])('measures clipped graphics only when their ancestor leaves visible ink ($clip)', async ({ clip, visible }) => {
      await withPage({ viewport: { width: 320, height: 915 } }, async page => {
        await page.setContent(`<style>
          body { margin: 32px } button { width: 48px; height: 48px; border: 0; outline: none; background: gray }
          span { position: absolute; width: ${visible ? 100 : 1}px; height: ${visible ? 24 : 1}px; overflow: hidden; ${clip} }
        </style><span><svg width="89" height="20"><path d="M0 0h89v20H0z" /></svg></span><button>Toggle</button>`)
        const result = await page.getByRole('button').evaluate(inspectInteractionFill, INTERACTION_FILL_CLEARANCE)
        expect(result.hasFill).toBe(true)
        expect(result.violations).toEqual(visible ? [{ neighbour: 'svg[]', distance: 0 }] : [])
      })
  })

  it('rejects a fill approaching a painted static neighbour with no text', async () => {
    await withPage({ viewport: { width: 320, height: 915 } }, async page => {
      await page.setContent(`<style>
        body { margin: 32px; display: flex; flex-direction: column; gap: 4px }
        button { position: relative; width: 160px; height: 48px; outline: none; border: 0 }
        button::after { content: ''; position: absolute; inset: -8px; background: gray }
        aside { height: 16px; background: black }
      </style><button>Rename</button><aside></aside>`)
      const result = await page.getByRole('button').evaluate(inspectInteractionFill, INTERACTION_FILL_CLEARANCE)
      expect(result.violations).toContainEqual({ neighbour: 'aside[]', distance: 0 })
    })
  })

  it('ignores transparent full-column tab targets on both sides of the measurement', async () => {
    await withPage({ viewport: { width: 320, height: 915 } }, async page => {
      await page.setContent(`<style>
        body { margin: 0 } nav { display: flex } button { width: 80px; height: 80px; padding: 0; border: 0; outline: none; background: transparent }
        span { display: inline-flex; padding: 8px; background: gray }
      </style><nav><button><span>One</span></button><button>Two</button><button><span>Three</span></button><button>Four</button></nav>`)
      const result = await page.getByRole('button').first().evaluate(inspectInteractionFill, INTERACTION_FILL_CLEARANCE)
      expect(result.hasFill).toBe(true)
      expect(result.fill.left).toBeGreaterThan(0)
      expect(result.fill.right).toBeLessThan(80)
      expect(result.violations).toEqual([])
    })
  })

  it.each([false, true])('permits contained grid cell paint but rejects an extension (outside=%s)', async (outside) => {
    await withPage({ viewport: { width: 320, height: 915 } }, async page => {
      await page.setContent(`<style>
        body { margin: 32px; display: flex } button { width: 80px; height: 80px; position: relative; border: 0; outline: none; background: gray }
        button::before { content: ''; position: absolute; inset: ${outside ? '-4px' : '0'}; background: gray }
      </style><button data-interaction-fill-cell>Monday</button><button>Tuesday</button>`)
      const result = await page.getByRole('button').first().evaluate(inspectInteractionFill, INTERACTION_FILL_CLEARANCE)
      expect(result.violations.some((violation) => violation.neighbour === 'button[Tuesday]')).toBe(outside)
    })
  })

  it.each([-4, 0, 4])('measures paint against its grid column without a neighbour (offset=%s)', async (offset) => {
    await withPage({ viewport: { width: 320, height: 915 } }, async page => {
      await page.setContent(`<style>
        body { margin: 32px } [data-interaction-fill-grid] { display: grid; grid-template-columns: repeat(7, 1fr) }
        button { width: 100%; height: 44px; padding: 0; border: 0; background: transparent; outline: none }
        span { display: block; height: 40px; background: gray; transform: translateX(${offset}px) }
      </style><div data-interaction-fill-grid><div><button aria-label="Day"><span></span></button></div></div>`)
      const result = await page.getByRole('button').evaluate(inspectInteractionFill, INTERACTION_FILL_CLEARANCE)
      expect(result.hasFill).toBe(true)
      expect(result.violations.some((violation) => violation.neighbour === 'grid cell edge')).toBe(offset !== 0)
    })
  })

})

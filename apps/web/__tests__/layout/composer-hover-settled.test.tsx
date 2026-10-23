import { afterAll, beforeAll, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { resolveWebThemeVariables } from '@/lib/theme-dom'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'
import { hoverSettledComposerControl } from '@/e2e/layout/composer-hover-state'

let browserLaunch: BrowserLaunch | undefined
let browser: Browser
let stylesheet: string
let menuScript: string
type MenuSample = { x: number; y: number; width: number; height: number; opacity: string }
declare global {
  interface Window { composerMenuSamples: MenuSample[] }
}

registerChromeLaunchHook(beforeAll, async (launch) => { browserLaunch = launch; browser = await launch })
beforeAll(async () => {
  const source = resolve(process.cwd(), 'app/globals.css')
  const theme = Object.entries(resolveWebThemeVariables('orange', 'light')).map(([key, value]) => `${key}:${value}`).join(';')
  stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
    + `:root{${theme}}`
  const buildOptions = {
    stdin: { contents: `import React, { useRef, useState } from 'react'; import { createRoot } from 'react-dom/client';
      import * as Menu from './components/ui/dropdown-menu';
      function MenuProbe() {
        return React.createElement(Menu.Root, null,
          React.createElement(Menu.Trigger, { asChild: true }, React.createElement('button', { style: { position: 'fixed', left: 900, top: 800 } }, 'Actions')),
          React.createElement(Menu.Content, { presentation: 'anchored', title: 'Attachments', items: [
            { id: 'file', label: 'File', disabled: true }, { id: 'image', label: 'Image', disabled: true }, { id: 'voice', label: 'Voice' }
          ] }));
      }
      createRoot(document.getElementById('root')).render(React.createElement(MenuProbe));`, resolveDir: process.cwd(), loader: 'tsx' },
    bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"production"' },
  }
  menuScript = execFileSync(process.execPath, ['--input-type=module', '-e', `
    import { build } from 'esbuild';
    const options = JSON.parse(process.argv[1]);
    options.plugins = [{ name: 'menu-sheet-boundary', setup(builder) {
      builder.onResolve({ filter: new RegExp('components/ui/sheet$') }, () => ({ path: 'sheet', namespace: 'menu-test' }));
      builder.onLoad({ filter: /.*/, namespace: 'menu-test' }, () => ({ contents: 'export const Sheet = () => null; export const useSheetHost = () => ({});', loader: 'js' }));
    }}];
    const result = await build(options);
    process.stdout.write(result.outputFiles[0].text);
  `, JSON.stringify(buildOptions)], { maxBuffer: 10 * 1024 * 1024 }).toString()
})
afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

it('exposes the first measurable menu box before anchoring', async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 915 }, reducedMotion: 'reduce' })
  try {
    await page.setContent(`<!doctype html><style>${stylesheet}</style><div id="root"></div>`)
    await page.evaluate(() => {
      const samples: MenuSample[] = []
      window.composerMenuSamples = samples
      const observer = new MutationObserver(() => {
        const item = document.querySelector('[role="menuitem"]')
        if (!item) return
        const bounds = item.getBoundingClientRect()
        samples.push({ x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height,
          opacity: getComputedStyle(item.closest('[data-radix-popper-content-wrapper]')!).opacity })
      })
      observer.observe(document.body, { childList: true, subtree: true, attributes: true })
    })
    await page.addScriptTag({ content: menuScript })
    await page.getByRole('button', { name: 'Actions', exact: true }).click()
    await page.waitForFunction(() => {
      const positioner = document.querySelector('[data-radix-popper-content-wrapper]')
      return positioner && getComputedStyle(positioner).opacity === '1'
    }, undefined, { timeout: 5000 })
    const samples = await page.evaluate(() => window.composerMenuSamples)
    const control = page.getByRole('menuitem', { name: 'File', exact: true })
    expect(samples.length).toBeGreaterThan(0)
    expect(await control.boundingBox()).not.toBeNull()
    await hoverSettledComposerControl(control)
    expect(await control.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe('rgba(0, 0, 0, 0)')
  } finally { await page.close() }
})

it('waits for the production menu opening transition before hovering', async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 915 } })
  try {
    await page.setContent(`<!doctype html><style>${stylesheet}.orbit-menu-panel{transition-duration:1000ms}</style><div id="root"></div>`)
    await page.addScriptTag({ content: menuScript })
    await page.getByRole('button', { name: 'Actions', exact: true }).click()
    const control = page.getByRole('menuitem', { name: 'File', exact: true })
    await control.evaluate(async (element) => {
      const panel = element.closest('.orbit-menu-panel')!
      panel.removeAttribute('data-positioned')
      await Promise.all(panel.getAnimations().map((animation) => animation.finished))
      panel.setAttribute('data-positioned', '')
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    })
    await hoverSettledComposerControl(control)
    expect(await control.evaluate((element) => element.closest('.orbit-menu-panel')!.getAnimations()
      .filter((animation) => animation.pending || animation.playState === 'running').length)).toBe(0)
    expect(await control.evaluate(async (element) => {
      const first = element.getBoundingClientRect().toJSON()
      for (let frame = 0; frame < 12; frame++) {
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
        if (JSON.stringify(element.getBoundingClientRect().toJSON()) !== JSON.stringify(first)) return false
      }
      return true
    })).toBe(true)
    expect(await control.evaluate((element) => element.matches(':hover'))).toBe(true)
    expect(await control.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe('rgba(0, 0, 0, 0)')
  } finally { await page.close() }
})

it('returns only after a hover fill transition has finished painting', async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 915 } })
  try {
    await page.setContent(`<!doctype html><style>${stylesheet}.orbit-menu-item:disabled:hover{background-color:rgb(100, 100, 100)}</style><div id="root"></div>`)
    await page.addScriptTag({ content: menuScript })
    await page.getByRole('button', { name: 'Actions', exact: true }).click()
    const control = page.getByRole('menuitem', { name: 'File', exact: true })
    await hoverSettledComposerControl(control)
    expect(await control.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe('rgb(100, 100, 100)')
  } finally { await page.close() }
})

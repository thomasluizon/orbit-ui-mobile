import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import en from '@orbit/shared/i18n/en.json'
import { readControlHitArea } from '@/test-support/control-hit-area'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

describe('keyboard viewport geometry', () => {
  let browser: Browser
  let launch: BrowserLaunch | undefined
  let stylesheet: string
  let script: string
  registerChromeLaunchHook(beforeAll, async (pending) => { launch = pending; browser = await pending })
  beforeAll(async () => {
    const source = resolve('app/globals.css')
    stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
    script = execFileSync(process.execPath, ['--input-type=module', '-e', `
      import { build } from 'esbuild';
      import { readFileSync } from 'node:fs';
      const result = await build({
        stdin: { contents: readFileSync(0, 'utf8'), resolveDir: process.cwd(), loader: 'tsx' },
        bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic',
        alias: { '@sentry/nextjs': '@sentry/browser' },
        define: { 'process.env.NODE_ENV': '"production"', 'process.env': '{}' },
      });
      process.stdout.write(result.outputFiles[0].text);
    `], { input: `import React, { useState } from 'react';
      import { createRoot } from 'react-dom/client';
      import { NextIntlClientProvider } from 'next-intl';
      import en from '@orbit/shared/i18n/en.json';
      import { FlowShell } from './components/shell/flow-shell';
      import { Sheet } from './components/ui/sheet';
      import { HabitChecklist } from './components/habits/habit-checklist';
      function ChecklistScreen() {
        const [items, setItems] = useState([]);
        return <FlowShell mode="detail" header={<header style={{ height: 48 }}>Create habit</header>} action={<button>Save</button>}>
          <div style={{ height: 1200 }} />
          <HabitChecklist editable items={items} onItemsChange={setItems} />
          <div style={{ height: 600 }} />
        </FlowShell>;
      }
      createRoot(document.getElementById('root')).render(
        <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
          {document.documentElement.dataset.surface === 'checklist' ? <ChecklistScreen /> : <>
            <FlowShell mode="full"><input aria-label="Screen field" /></FlowShell>
            <FlowShell mode="detail" action={<button>Continue</button>}><input aria-label="Detail field" /></FlowShell>
            <Sheet title="Editor" actions={<button>Save</button>}>
              <div style={{ height: 1600 }} /><input aria-label="Checklist add" />
            </Sheet>
          </>}
        </NextIntlClientProvider>);`, encoding: 'utf8', maxBuffer: 30 * 1024 * 1024 })
  })
  afterAll(async () => { await closeChrome(launch) })

  it.each([412, 1280])('keeps shell and sheet layout heights while pinch zooming at %ipx', async (width) => {
    const page = await browser.newPage({ viewport: { width, height: 915 }, reducedMotion: 'reduce' })
    try {
      await page.setContent(`<meta name="viewport" content="width=device-width, initial-scale=1, interactive-widget=resizes-content"><style>${stylesheet}</style><div id="root"></div>`)
      await page.addScriptTag({ content: script })
      await page.getByRole('textbox', { name: 'Checklist add' }).waitFor()
      const measure = () => page.evaluate(() => ({
        shells: [...document.querySelectorAll('[data-shell="wide"], [data-flow-mode="full"]')]
          .map(element => element.getBoundingClientRect().height),
        sheet: document.querySelector('[role="dialog"]')!.getBoundingClientRect().height,
      }))
      const original = await measure()
      expect(original.shells).toEqual([915, 915])
      const session = await page.context().newCDPSession(page)
      await session.send('Emulation.setPageScaleFactor', { pageScaleFactor: 2 })
      await page.waitForFunction(() => window.visualViewport!.scale > 1)
      await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
      expect(await measure()).toEqual(original)
      await session.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1 })
      await page.waitForFunction(() => window.visualViewport!.scale === 1)
      await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
      expect(await measure()).toEqual(original)
    } finally { await page.close() }
  })

  it.each([412, 1280])('keeps checklist action hit areas exposed without an on-screen keyboard at %ipx', async (width) => {
    const page = await browser.newPage({ viewport: { width, height: 915 }, reducedMotion: 'reduce' })
    try {
      await page.setContent(`<html data-surface="checklist"><meta name="viewport" content="width=device-width, initial-scale=1, interactive-widget=resizes-content"><style>${stylesheet}</style><div id="root"></div></html>`)
      await page.addScriptTag({ content: script })
      const field = page.getByRole('textbox', { name: en.habits.form.checklistPlaceholder, exact: true })
      await field.fill('Valor Mortis')
      await field.press('Enter')
      const row = page.locator('.checklist-drag-handle').locator('..')
      for (const label of [en.habits.form.duplicateChecklistItem, en.habits.form.removeChecklistItem, en.habits.form.clearChecklist]) {
        await row.hover()
        const target = page.getByRole('button', { name: label, exact: true })
        await target.scrollIntoViewIfNeeded()
        await target.hover()
        const hitArea = await target.evaluate(readControlHitArea)
        const detail = `${label}: ${JSON.stringify(hitArea)}`
        if (hitArea.checks.some(check => !check)) process.stderr.write(`${detail}\n`)
        expect(hitArea.checks, detail).toEqual([true, true, true, true])
      }
    } finally { await page.close() }
  })
})

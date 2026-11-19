import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

let browserLaunch: BrowserLaunch | undefined
let browser: Browser
let stylesheet: string
let flowScript: string

const ENTRY = `
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { NextIntlClientProvider } from 'next-intl';
import en from '@orbit/shared/i18n/en.json';
import { ProgressSubscreen, ProgressSubscreenLayer } from './app/(app)/progress/_components/progress-subscreen';
import { StreakRepairFlow } from './app/(app)/progress/_components/streak-repair-flow';

const state = { count: 2, dates: ['2026-09-08', '2026-09-09'] };
const repair = { isPending: false, isError: false, error: null, mutate: () => {}, reset: () => {} };

function Screen() {
  const [open, setOpen] = useState(false);
  return React.createElement(ProgressSubscreen, { screen: 'streak', hideHeader: true },
    React.createElement('button', { onClick: () => setOpen(true) }, 'Repair the streak'),
    open ? React.createElement(ProgressSubscreenLayer, null,
      React.createElement(StreakRepairFlow, { state, repair, onClose: () => setOpen(false), onRepaired: () => {} })) : null);
}

createRoot(document.getElementById('root')).render(
  React.createElement(NextIntlClientProvider, { locale: 'en', messages: en, timeZone: 'UTC' }, React.createElement(Screen)));
`

beforeAll(async () => {
  const source = resolve(process.cwd(), 'app/globals.css')
  stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
  const buildOptions = {
    stdin: { contents: ENTRY, resolveDir: process.cwd(), loader: 'tsx' },
    bundle: true, write: false, format: 'iife', platform: 'browser', conditions: ['browser'], alias: { '@sentry/nextjs': '@sentry/react' }, jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"production"' },
  }
  flowScript = execFileSync(process.execPath, ['--input-type=module', '-e', `
    import { build } from 'esbuild';
    const options = JSON.parse(process.argv[1]);
    const stubs = {
      'next/navigation': 'export const useRouter = () => ({ replace() {}, push() {} });',
      '@/lib/posthog': 'export const captureGuidedFlowEvent = () => {}; export const captureGuidedFlowCompleted = () => {};',
    };
    options.plugins = [{ name: 'repair-focus-boundary', setup(builder) {
      builder.onResolve({ filter: /^(next\\/navigation|@\\/lib\\/posthog)$/ }, (args) => ({ path: args.path, namespace: 'repair-stub' }));
      builder.onLoad({ filter: /.*/, namespace: 'repair-stub' }, (args) => ({ contents: stubs[args.path], loader: 'js' }));
    }}];
    const result = await build(options);
    process.stdout.write(result.outputFiles[0].text);
  `, JSON.stringify(buildOptions)], { maxBuffer: 20 * 1024 * 1024 }).toString()
}, 120_000)
registerChromeLaunchHook(beforeAll, async (launch) => { browserLaunch = launch; browser = await launch })
afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

describe('the streak repair flow in Chromium', () => {
  it('puts keyboard focus on the question heading when the flow opens', async () => {
    const page = await browser.newPage({ viewport: { width: 412, height: 915 }, reducedMotion: 'reduce' })
    try {
      await page.setContent(`<!doctype html><html lang="en"><style>${stylesheet}</style><body><div id="root"></div></body></html>`)
      await page.addScriptTag({ content: 'globalThis.process = { env: {} }' })
      await page.addScriptTag({ content: flowScript })
      await page.getByRole('button', { name: 'Repair the streak', exact: true }).click()
      await page.waitForSelector('[data-question-flow] h1')
      const focus = await page.evaluate(() => {
        const active = document.activeElement
        return { tag: active?.tagName, insideFlow: Boolean(active?.closest('[data-question-flow]')), isHeading: active === document.querySelector('[data-question-flow] h1') }
      })
      expect(focus, JSON.stringify(focus)).toEqual({ tag: 'H1', insideFlow: true, isHeading: true })
    } finally { await page.close() }
  })
})

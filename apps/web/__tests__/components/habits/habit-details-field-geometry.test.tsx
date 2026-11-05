import { execFileSync } from 'node:child_process'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'
import { loadAppFonts } from '@/__tests__/support/app-fonts'
import { compileHabitRowStylesheet } from '@/__tests__/support/habit-row-standard-geometry'
import { resolveWebThemeVariables } from '@/lib/theme-dom'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'

function bundleDetailRows() {
  const contents = `import React from 'react';
    import { createRoot } from 'react-dom/client';
    import { NextIntlClientProvider, useTranslations } from 'next-intl';
    import en from '../../packages/shared/src/i18n/en.json';
    import ptBR from '../../packages/shared/src/i18n/pt-BR.json';
    import { SlipAlertSection } from './components/habits/habit-form-fields/slip-alert-section';
    import { TagPickerField } from './components/habits/habit-form-fields/tag-picker-field';
    const root = document.getElementById('root');
    const locale = root.dataset.locale;
    function Details() {
      const t = useTranslations();
      return <main style={{ paddingInline: 16 }}><div data-field-column="" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <SlipAlertSection inline hasProAccess slipAlertEnabled={false} onToggle={() => {}} t={t} />
        <TagPickerField tags={[]} selectedIds={[]} atLimit={false} onToggle={() => {}} onCreate={() => {}} onEdit={() => {}} onDelete={() => {}} editLabel="edit" deleteLabel="delete" />
      </div></main>;
    }
    createRoot(root).render(<NextIntlClientProvider locale={locale} messages={locale === 'en' ? en : ptBR} timeZone="UTC"><Details /></NextIntlClientProvider>);`
  const options = { stdin: { contents, resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, write: false, format: 'iife', platform: 'browser', conditions: ['browser'], alias: { '@sentry/nextjs': '@sentry/react' }, jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"', 'process.env': '{}' } }
  const script = `import { build } from 'esbuild';
    const options = ${JSON.stringify(options)};
    options.plugins = [{ name: 'detail-boundaries', setup(build) {
      build.onResolve({ filter: /^next\\/navigation$/ }, args => ({ path: args.path, namespace: 'detail-boundary' }));
      build.onLoad({ filter: /.*/, namespace: 'detail-boundary' }, () => ({ loader: 'js', contents: 'export const useRouter = () => ({ push() {} }); export const usePathname = () => "/";' }));
    }}];
    const result = await build(options); process.stdout.write(result.outputFiles[0].text);`
  return execFileSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 })
}

function readFieldFill(control: Element) {
  const column = control.closest('[data-field-column]')!.getBoundingClientRect()
  const shell = control.closest('.orbit-list-row-shell')!
  const fill = shell.querySelector('.orbit-list-row-outset')!
  const bounds = fill.getBoundingClientRect()
  const target = control.getBoundingClientRect()
  return { fillLeft: bounds.left - column.left, fillRight: column.right - bounds.right, targetLeft: target.left - column.left, targetRight: column.right - target.right, background: getComputedStyle(fill).backgroundColor }
}

describe('More details field rows', () => {
  let launch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string
  let bundle: string
  registerChromeLaunchHook(beforeAll, async (pending) => { launch = pending; browser = await pending })
  beforeAll(async () => { stylesheet = await compileHabitRowStylesheet(); bundle = bundleDetailRows() })
  afterAll(async () => { await closeChrome(launch) })

  it.each([320, 1280].flatMap(width => [1, 2].flatMap(scale => (['en', 'pt-BR'] as const).flatMap(locale => (['light', 'dark'] as const).map(mode => ({ width, scale, locale, mode }))))))(
    'keeps hover and press paint on the field column edge at $width and $scale in $locale/$mode', async ({ width, scale, locale, mode }) => {
    const page = await browser.newPage({ viewport: { width, height: 915 }, reducedMotion: 'reduce' })
    try {
      const tokens = Object.entries(resolveWebThemeVariables('orange', mode)).map(([key, value]) => `${key}:${value}`).join(';')
      await page.setContent(`<!doctype html><style>${stylesheet}:root{${tokens};font-size:${16 * scale}px}body{margin:0;background:var(--bg)}</style><div id="root" data-locale="${locale}"></div>`)
      await loadAppFonts(page)
      await page.addScriptTag({ content: bundle })
      const messages = locale === 'en' ? en : ptBR
      const controls = [
        page.getByRole('switch', { name: messages.habits.form.slipAlert }),
        page.getByRole('button', { name: new RegExp(`^${messages.habits.form.tags}`) }),
      ]
      for (const control of controls) {
        await expect.poll(() => control.count()).toBe(1)
        await control.hover()
        await page.mouse.down()
        await expect.poll(async () => (await control.evaluate(readFieldFill)).background).not.toBe('rgba(0, 0, 0, 0)')
        const pressed = await control.evaluate(readFieldFill)
        await page.mouse.move(0, 0)
        await page.mouse.up()
        expect(pressed.fillLeft).toBeCloseTo(0, 0)
        expect(pressed.fillRight).toBeCloseTo(0, 0)
        expect(pressed.targetLeft).toBeCloseTo(0, 0)
        expect(pressed.targetRight).toBeCloseTo(0, 0)
        expect(pressed.background).not.toBe('rgba(0, 0, 0, 0)')
      }
    } finally { await page.close() }
  })
})
